import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "+" + digits;
}

async function assertAdmin(
  supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "b2b_setter" }) => unknown },
  userId: string,
) {
  const res = await (supabase.rpc("has_role", { _user_id: userId, _role: "admin" }) as Promise<{ data: boolean | null }>);
  if (!res.data) throw new Error("Forbidden");
}

// ---------- Start a call ----------
// Logs the attempt and returns the lead's number. The client opens the Quo
// (OpenPhone) app via a deep link, falling back to the device dialer.
// Setters are invited to the shared Quo workspace by an admin; we don't
// assign per-setter numbers from the app anymore.
export const startBridgeCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      lead_id: z.string().uuid().optional(),
      pool_lead_id: z.string().uuid().optional(),
    }).refine((v) => !!(v.lead_id || v.pool_lead_id), { message: "lead_id or pool_lead_id required" }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let toNumber: string = "";
    if (data.lead_id) {
      const { data: lead } = await supabase
        .from("leads").select("id, phone, name").eq("id", data.lead_id).maybeSingle();
      if (!lead) throw new Error("Lead not found");
      if (!lead.phone) throw new Error("Lead has no phone number");
      toNumber = normalizeE164(lead.phone);
    } else if (data.pool_lead_id) {
      const { data: pl } = await supabase
        .from("b2b_lead_pool").select("id, phone, claimed_by").eq("id", data.pool_lead_id).maybeSingle();
      if (!pl) throw new Error("Lead not found");
      if (!pl.phone) throw new Error("Lead has no phone number");
      toNumber = normalizeE164(pl.phone);
    }

    const { data: log } = await supabase.from("call_logs").insert({
      lead_id: data.lead_id ?? null,
      pool_lead_id: data.pool_lead_id ?? null,
      user_id: userId,
      openphone_call_id: null,
      direction: "outbound",
      status: "initiated",
      from_number: null,
      to_number: toNumber,
      started_at: new Date().toISOString(),
    } as any).select("id").maybeSingle();

    return { ok: true, call_log_id: log?.id, dial: toNumber, from: null as string | null };
  });

export const listCallsForPoolLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pool_lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("call_logs").select("*")
      .eq("pool_lead_id", data.pool_lead_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

// ---------- Call history ----------
export const listCallsForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("call_logs").select("*")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCallsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("call_logs").select("*, leads:lead_id(name, company)")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Backfill OpenPhone artifacts ----------
// Admin-only. For every call_logs row that has an openphone_call_id but is
// missing transcript / recording / summary, fetch the artifacts from
// OpenPhone's REST API and patch the row.
type OpDialogue = { identifier?: string; userId?: string; content?: string; text?: string };
type OpObj = {
  dialogue?: OpDialogue[];
  text?: string;
  transcript?: string;
  summary?: string | string[];
  nextSteps?: string[];
};

function fmtTranscript(o: OpObj | null | undefined): string | null {
  if (!o) return null;
  if (Array.isArray(o.dialogue) && o.dialogue.length > 0) {
    return o.dialogue
      .map((d) => `${d.identifier || d.userId || "Speaker"}: ${d.content || d.text || ""}`.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (typeof o.transcript === "string") return o.transcript;
  if (typeof o.text === "string") return o.text;
  return null;
}

function fmtSummary(o: OpObj | null | undefined): string | null {
  if (!o) return null;
  const parts: string[] = [];
  if (Array.isArray(o.summary)) parts.push(o.summary.join("\n"));
  else if (typeof o.summary === "string") parts.push(o.summary);
  if (Array.isArray(o.nextSteps) && o.nextSteps.length > 0) {
    parts.push("Next steps:\n- " + o.nextSteps.join("\n- "));
  }
  return parts.length ? parts.join("\n\n") : null;
}

async function opGet(path: string, apiKey: string): Promise<unknown | null> {
  try {
    const res = await fetch(`https://api.quo.com${path}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const backfillOpenphoneArtifacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.OPENPHONE_API_KEY;
    if (!apiKey) throw new Error("OPENPHONE_API_KEY is not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let adopted = 0;

    // ---- Step 1: adopt unlinked call_logs rows by matching against the
    // OpenPhone /v1/calls list for each pool number. Webhook events for these
    // rows were missed (signature mismatch, etc), so they have no
    // openphone_call_id yet.
    type OpCall = {
      id: string;
      direction?: string;
      from?: string;
      to?: string | string[];
      participants?: string[];
      createdAt?: string;
      answeredAt?: string;
      completedAt?: string;
      duration?: number;
      status?: string;
    };

    const { data: pool } = await supabaseAdmin
      .from("openphone_number_pool")
      .select("openphone_number_id, phone_e164, assigned_user_id");

    // Look back 14 days
    const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const poolNumbers = pool ?? [];

    // Pull unlinked rows in the same window. Quo's call list requires the
    // external participant phone number, so query per row instead of trying to
    // list all recent calls for a workspace number.
    const { data: unlinked } = await supabaseAdmin
      .from("call_logs")
      .select("id, to_number, started_at")
      .is("openphone_call_id", null)
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false });

    const digits10 = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);
    const usedCallIds = new Set<string>();
    for (const row of unlinked ?? []) {
      const targetNumber = normalizeE164(row.to_number ?? "");
      const target = digits10(targetNumber);
      if (!target) continue;
      const rowTs = row.started_at ? new Date(row.started_at).getTime() : 0;
      const allCalls: OpCall[] = [];
      for (const p of poolNumbers) {
        let pageToken: string | undefined = undefined;
        for (let page = 0; page < 3; page++) {
          const qs = new URLSearchParams({
            phoneNumberId: p.openphone_number_id,
            maxResults: "50",
            createdAfter: sinceIso,
          });
          qs.append("participants[]", targetNumber);
          if (pageToken) qs.set("pageToken", pageToken);
          type ListRes = { data?: OpCall[]; nextPageToken?: string | null };
          const list = (await opGet(`/v1/calls?${qs.toString()}`, apiKey)) as ListRes | null;
          if (!list?.data) break;
          allCalls.push(...list.data);
          if (!list.nextPageToken) break;
          pageToken = list.nextPageToken;
        }
      }
      // Pick the OpenPhone call with same destination digits and the closest
      // createdAt to our row's started_at, within 30 minutes.
      let best: { call: OpCall; delta: number } | null = null;
      for (const c of allCalls) {
        if (usedCallIds.has(c.id)) continue;
        const participants = c.participants ?? (Array.isArray(c.to) ? c.to : c.to ? [c.to] : []);
        const match = participants.some((p) => digits10(p) === target);
        if (!match) continue;
        const cTs = c.createdAt ? new Date(c.createdAt).getTime() : 0;
        const delta = Math.abs(cTs - rowTs);
        if (delta > 30 * 60 * 1000) continue;
        if (!best || delta < best.delta) best = { call: c, delta };
      }
      if (best) {
        usedCallIds.add(best.call.id);
        const adoptPatch: {
          openphone_call_id: string;
          from_number?: string;
          direction?: string;
          status?: string;
          duration_sec?: number;
          started_at?: string;
          ended_at?: string;
        } = { openphone_call_id: best.call.id };
        if (typeof best.call.from === "string") adoptPatch.from_number = best.call.from;
        if (typeof best.call.direction === "string") adoptPatch.direction = best.call.direction;
        if (best.call.status) adoptPatch.status = best.call.status;
        if (typeof best.call.duration === "number") adoptPatch.duration_sec = best.call.duration;
        if (best.call.answeredAt) adoptPatch.started_at = best.call.answeredAt;
        if (best.call.completedAt) adoptPatch.ended_at = best.call.completedAt;
        await supabaseAdmin.from("call_logs").update(adoptPatch).eq("id", row.id);
        adopted++;
      }
    }

    // ---- Step 1b: for each workspace pool number, list recent Quo calls and
    // insert a call_logs row for any that we still don't have. This captures
    // direct calls made from the Quo app (not initiated from our in-app
    // "Call" button).
    let ingested = 0;
    for (const p of poolNumbers) {
      if (!p.assigned_user_id) continue;
      let pageToken: string | undefined = undefined;
      const seen: OpCall[] = [];
      for (let page = 0; page < 5; page++) {
        const qs = new URLSearchParams({
          phoneNumberId: p.openphone_number_id,
          maxResults: "50",
          createdAfter: sinceIso,
        });
        if (pageToken) qs.set("pageToken", pageToken);
        type ListRes = { data?: OpCall[]; nextPageToken?: string | null };
        const list = (await opGet(`/v1/calls?${qs.toString()}`, apiKey)) as ListRes | null;
        if (!list?.data) break;
        seen.push(...list.data);
        if (!list.nextPageToken) break;
        pageToken = list.nextPageToken;
      }
      if (seen.length === 0) continue;

      const ids = seen.map((c) => c.id);
      const { data: existing } = await supabaseAdmin
        .from("call_logs")
        .select("openphone_call_id")
        .in("openphone_call_id", ids);
      const existingSet = new Set((existing ?? []).map((r) => r.openphone_call_id));

      for (const c of seen) {
        if (existingSet.has(c.id)) continue;
        const participants = c.participants ?? (Array.isArray(c.to) ? c.to : c.to ? [c.to] : []);
        const workspaceDigits = digits10(p.phone_e164);
        const external = participants.find((x) => digits10(x) !== workspaceDigits) ?? participants[0] ?? null;
        const externalDigits = digits10(external);

        let pool_lead_id: string | null = null;
        let lead_id: string | null = null;
        if (externalDigits) {
          const like = `%${externalDigits}`;
          const { data: pl } = await supabaseAdmin
            .from("b2b_lead_pool").select("id").ilike("phone", like).limit(1).maybeSingle();
          if (pl) pool_lead_id = pl.id;
          else {
            const { data: ld } = await supabaseAdmin
              .from("leads").select("id").ilike("phone", like).limit(1).maybeSingle();
            if (ld) lead_id = ld.id;
          }
        }

        await supabaseAdmin.from("call_logs").insert({
          user_id: p.assigned_user_id,
          lead_id,
          pool_lead_id,
          openphone_call_id: c.id,
          direction: c.direction ?? "outbound",
          status: c.status ?? null,
          from_number: typeof c.from === "string" ? c.from : null,
          to_number: Array.isArray(c.to) ? c.to[0] : (c.to ?? null),
          duration_sec: typeof c.duration === "number" ? c.duration : null,
          started_at: c.answeredAt || c.createdAt || null,
          ended_at: c.completedAt ?? null,
        } as any);
        ingested++;
      }
    }

    // ---- Step 2: fetch artifacts for every linked row missing them.
    const { data: rows, error } = await supabaseAdmin
      .from("call_logs")
      .select("id, openphone_call_id, transcript, recording_url, summary")
      .not("openphone_call_id", "is", null)
      .or("recording_url.is.null,transcript.is.null,summary.is.null")
      .order("started_at", { ascending: false });
    if (error) throw new Error(error.message);

    let scanned = 0;
    let updated = 0;
    let txFilled = 0;
    let recFilled = 0;
    let sumFilled = 0;

    for (const row of rows ?? []) {
      scanned++;
      const callId = row.openphone_call_id as string;
      const patch: { recording_url?: string; transcript?: string; transcript_status?: string; summary?: string } = {};

      if (!row.recording_url) {
        type RecRes = { data?: Array<{ url?: string; media?: Array<{ url?: string }> }> };
        const rec = (await opGet(`/v1/call-recordings/${encodeURIComponent(callId)}`, apiKey)) as RecRes | null;
        const url = rec?.data?.[0]?.url || rec?.data?.[0]?.media?.[0]?.url;
        if (url) {
          patch.recording_url = url;
          recFilled++;
        }
      }

      if (!row.transcript) {
        type TxRes = { data?: OpObj & { status?: string } };
        const tx = (await opGet(`/v1/call-transcripts/${encodeURIComponent(callId)}`, apiKey)) as TxRes | null;
        if (tx?.data) {
          const t = fmtTranscript(tx.data);
          if (t) {
            patch.transcript = t;
            txFilled++;
          }
          if (tx.data.status) patch.transcript_status = tx.data.status;
        }
      }

      if (!row.summary) {
        type SumRes = { data?: OpObj };
        const sum = (await opGet(`/v1/call-summaries/${encodeURIComponent(callId)}`, apiKey)) as SumRes | null;
        const s = fmtSummary(sum?.data);
        if (s) {
          patch.summary = s;
          sumFilled++;
        }
      }

      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("call_logs").update(patch).eq("id", row.id);
        updated++;
      }
    }

    return { ok: true, scanned, adopted, ingested, updated, txFilled, recFilled, sumFilled };
  });

// ---------- Setter call stats (sourced from Quo) ----------
function etBoundaries() {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(now).map((p) => [p.type, p.value])) as Record<string, string>;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUtc - now.getTime();
  const etNow = new Date(now.getTime() + offsetMs);
  const todayEt = new Date(etNow); todayEt.setUTCHours(0, 0, 0, 0);
  const dow = etNow.getUTCDay();
  const daysFromMon = (dow + 6) % 7;
  const mondayEt = new Date(etNow);
  mondayEt.setUTCDate(etNow.getUTCDate() - daysFromMon);
  mondayEt.setUTCHours(1, 0, 0, 0);
  if (etNow.getTime() < mondayEt.getTime()) mondayEt.setUTCDate(mondayEt.getUTCDate() - 7);
  return {
    todayStartIso: new Date(todayEt.getTime() - offsetMs).toISOString(),
    weekStartIso: new Date(mondayEt.getTime() - offsetMs).toISOString(),
  };
}

type StatRow = { started_at: string | null; created_at: string; duration_sec: number | null; status: string | null; direction: string | null };

function bucket(rows: StatRow[]) {
  const dials = rows.length;
  const connected = rows.filter((r) => (r.duration_sec ?? 0) > 0).length;
  const talkSec = rows.reduce((s, r) => s + (r.duration_sec ?? 0), 0);
  return { dials, connected, talkSec };
}

export const getMyCallStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { todayStartIso, weekStartIso } = etBoundaries();

    const { data, error } = await supabase
      .from("call_logs")
      .select("started_at, created_at, duration_sec, status, direction")
      .eq("user_id", userId)
      .neq("status", "manual_outcome")
      .order("started_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as StatRow[];
    const at = (r: StatRow) => new Date(r.started_at ?? r.created_at).getTime();
    const todayMs = new Date(todayStartIso).getTime();
    const weekMs = new Date(weekStartIso).getTime();

    const outbound = rows.filter((r) => !(r.direction ?? "").startsWith("in"));

    const { data: lastSynced } = await supabase
      .from("call_logs")
      .select("updated_at")
      .eq("user_id", userId)
      .not("openphone_call_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      today: bucket(outbound.filter((r) => at(r) >= todayMs)),
      week: bucket(outbound.filter((r) => at(r) >= weekMs)),
      all: bucket(outbound),
      inboundToday: rows.filter((r) => (r.direction ?? "").startsWith("in") && at(r) >= todayMs).length,
      lastSyncedAt: lastSynced?.updated_at ?? null,
    };
  });

// ---------- Recording hub ----------
export type RecordingRow = {
  id: string;
  openphone_call_id: string | null;
  lead_id: string | null;
  pool_lead_id: string | null;
  direction: string | null;
  status: string | null;
  from_number: string | null;
  to_number: string | null;
  duration_sec: number | null;
  started_at: string | null;
  created_at: string;
  recording_url: string | null;
  transcript: string | null;
  transcript_status: string | null;
  summary: string | null;
  leads: { name: string | null; company: string | null } | null;
  pool: { first_name: string | null; last_name: string | null; company: string | null } | null;
};

export const listMyRecordings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      search: z.string().trim().max(120).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(5).max(50).default(20),
      sort: z.enum(["newest", "longest"]).default("newest"),
      recordedOnly: z.boolean().default(false),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabase
      .from("call_logs")
      .select(
        "id, openphone_call_id, lead_id, pool_lead_id, direction, status, from_number, to_number, duration_sec, started_at, created_at, recording_url, transcript, transcript_status, summary, leads:lead_id(name, company), pool:pool_lead_id(first_name, last_name, company)",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .neq("status", "manual_outcome");

    if (data.recordedOnly) q = q.not("recording_url", "is", null);

    const search = (data.search ?? "").trim();
    if (search) {
      const digits = search.replace(/\D/g, "");
      const ors: string[] = [];
      if (digits.length >= 3) {
        ors.push(`to_number.ilike.%${digits}%`, `from_number.ilike.%${digits}%`);
      }
      if (/[a-z]/i.test(search)) {
        const [leadsRes, poolRes] = await Promise.all([
          supabase.from("leads").select("id").eq("assigned_user_id", userId).ilike("name", `%${search}%`).limit(200),
          supabase.from("b2b_lead_pool").select("id")
            .eq("claimed_by", userId)
            .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`)
            .limit(200),
        ]);
        const leadIds = (leadsRes.data ?? []).map((r) => r.id);
        const poolIds = (poolRes.data ?? []).map((r) => r.id);
        if (leadIds.length) ors.push(`lead_id.in.(${leadIds.join(",")})`);
        if (poolIds.length) ors.push(`pool_lead_id.in.(${poolIds.join(",")})`);
      }
      if (ors.length === 0) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      q = q.or(ors.join(","));
    }

    q = data.sort === "longest"
      ? q.order("duration_sec", { ascending: false, nullsFirst: false })
      : q.order("started_at", { ascending: false, nullsFirst: false });

    const { data: rows, count, error } = await q.range(from, to);
    if (error) throw new Error(error.message);

    return {
      rows: (rows ?? []) as unknown as RecordingRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ---------- Manual refresh from Quo (setter-facing) ----------
export const syncMyCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("openphone_number_e164").eq("user_id", userId).maybeSingle();

    let number = profile?.openphone_number_e164 ?? null;
    if (!number) {
      const { data: pool } = await supabase
        .from("openphone_number_pool").select("phone_e164").eq("assigned_user_id", userId).limit(1);
      number = pool?.[0]?.phone_e164 ?? null;
    }
    if (!number) return { ok: false, reason: "no_number" as const };

    const { syncQuoCalls } = await import("@/lib/quo-sync.server");
    const sinceIso = new Date(Date.now() - 24 * 3600_000).toISOString();
    const result = await syncQuoCalls({ sinceIso, onlyNumberE164: number, maxConversationPages: 3, maxArtifacts: 25 });
    return { ok: true as const, ...result };
  });
