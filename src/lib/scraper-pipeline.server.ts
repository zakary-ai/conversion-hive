// Server-only: runs the daily scraper + distribute pipeline.
// Uses supabaseAdmin (bypasses RLS) — only callable from server fns / server routes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RawLead = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  source?: string | null;
  [k: string]: unknown;
};

type Setter = { user_id: string; full_name: string | null; daily_lead_quota: number };

export type PipelineResult = {
  enabled: boolean;
  recycled: number;
  fetched: number;
  inserted: number;
  distributed: number;
  perSetter: Array<{ user_id: string; name: string | null; needed: number; assigned: number; shortfall: number }>;
  errors: string[];
};

function pickField(row: RawLead, key: string | undefined, fallback: string): unknown {
  if (key && key in row) return row[key];
  return row[fallback];
}

async function callApify(actorId: string, input: Record<string, unknown>, token: string): Promise<RawLead[]> {
  if (!actorId) return [];
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input || {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify call failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("Apify returned non-array dataset");
  return data as RawLead[];
}

export async function runScraperPipeline(opts: { triggeredBy: string }): Promise<PipelineResult> {
  const errors: string[] = [];
  const result: PipelineResult = {
    enabled: false,
    recycled: 0,
    fetched: 0,
    inserted: 0,
    distributed: 0,
    perSetter: [],
    errors,
  };

  // 1. Settings
  const { data: settings, error: sErr } = await supabaseAdmin
    .from("scraper_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!settings || !settings.enabled) {
    return result;
  }
  result.enabled = true;
  const recycleDays = (settings.recycle_days as number) ?? 3;
  const batchSize = (settings.batch_size as number) ?? 200;
  const fieldMap = (settings.field_map as Record<string, string>) ?? {};
  const apifyInput = (settings.apify_input as Record<string, unknown>) ?? {};
  const actorId = (settings.apify_actor_id as string) ?? "";

  // 2. Enabled setters (clients with scraper_enabled = true)
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").eq("role", "client");
  const clientIds = (roles ?? []).map((r) => r.user_id as string);
  if (clientIds.length === 0) return result;

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, full_name, scraper_enabled, daily_lead_quota")
    .in("user_id", clientIds);

  const setters: Setter[] = (profiles ?? [])
    .filter((p) => (p as { scraper_enabled?: boolean }).scraper_enabled !== false)
    .map((p) => ({
      user_id: p.user_id as string,
      full_name: (p.full_name as string | null) ?? null,
      daily_lead_quota: ((p as { daily_lead_quota?: number }).daily_lead_quota as number) ?? 75,
    }));

  if (setters.length === 0) return result;

  // 3. Recycle: No Answer leads older than N days → unassign and reset to New
  const cutoff = new Date(Date.now() - recycleDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: recyclable } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("status", "No Answer")
    .eq("retired", false)
    .eq("do_not_contact", false)
    .lt("last_status_change_at", cutoff);

  const recycleIds = (recyclable ?? []).map((r) => r.id as string);
  if (recycleIds.length > 0) {
    const { error: recErr } = await supabaseAdmin
      .from("leads")
      .update({ status: "New", assigned_user_id: null })
      .in("id", recycleIds);
    if (recErr) errors.push(`recycle: ${recErr.message}`);
    else result.recycled = recycleIds.length;
  }

  // 4. Compute total demand
  const { data: newLeads } = await supabaseAdmin
    .from("leads")
    .select("id, assigned_user_id")
    .eq("status", "New");
  const newByUser = new Map<string, number>();
  for (const l of newLeads ?? []) {
    const u = (l.assigned_user_id as string | null) ?? null;
    if (u) newByUser.set(u, (newByUser.get(u) ?? 0) + 1);
  }

  let totalDemand = 0;
  for (const s of setters) {
    const need = Math.max(0, s.daily_lead_quota - (newByUser.get(s.user_id) ?? 0));
    totalDemand += need;
  }

  // 5. Scrape (only if we need more than the unassigned pool already covers)
  const unassignedCount = (newLeads ?? []).filter((l) => !l.assigned_user_id).length;
  const needFromScrape = Math.max(0, totalDemand - unassignedCount);

  if (needFromScrape > 0 && actorId) {
    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) {
      errors.push("APIFY_TOKEN not configured");
    } else {
      try {
        const wantedBatch = Math.min(Math.max(batchSize, needFromScrape), 1000);
        const raw = await callApify(actorId, { ...apifyInput, maxItems: wantedBatch }, apifyToken);
        result.fetched = raw.length;

        // Dedupe within batch and against DB by phone + email
        const phones = new Set<string>();
        const emails = new Set<string>();
        const candidates: Array<{ name: string; phone: string | null; email: string | null; company: string | null; source: string | null }> = [];
        for (const r of raw) {
          const name = String(pickField(r, fieldMap.name, "name") ?? "").trim();
          if (!name) continue;
          const phone = (pickField(r, fieldMap.phone, "phone") as string | null | undefined) || null;
          const email = (pickField(r, fieldMap.email, "email") as string | null | undefined) || null;
          const company = (pickField(r, fieldMap.company, "company") as string | null | undefined) || null;
          const source = (pickField(r, fieldMap.source, "source") as string | null | undefined) || "apify";
          if (phone && phones.has(phone)) continue;
          if (email && emails.has(email)) continue;
          if (phone) phones.add(phone);
          if (email) emails.add(email);
          candidates.push({ name: name.slice(0, 200), phone: phone?.slice(0, 50) ?? null, email: email?.slice(0, 200) ?? null, company: company?.slice(0, 200) ?? null, source: source?.slice(0, 120) ?? null });
        }

        // Check existing DB phones/emails
        const phoneList = [...phones];
        const emailList = [...emails];
        const existing = new Set<string>();
        if (phoneList.length > 0) {
          const { data } = await supabaseAdmin.from("leads").select("phone").in("phone", phoneList);
          for (const r of data ?? []) if (r.phone) existing.add("p:" + r.phone);
        }
        if (emailList.length > 0) {
          const { data } = await supabaseAdmin.from("leads").select("email").in("email", emailList);
          for (const r of data ?? []) if (r.email) existing.add("e:" + r.email);
        }

        const toInsert = candidates.filter((c) =>
          !(c.phone && existing.has("p:" + c.phone)) &&
          !(c.email && existing.has("e:" + c.email))
        ).map((c) => ({ ...c, status: "New" as const, assigned_user_id: null }));

        if (toInsert.length > 0) {
          const { error: insErr } = await supabaseAdmin.from("leads").insert(toInsert);
          if (insErr) errors.push(`insert: ${insErr.message}`);
          else result.inserted = toInsert.length;
        }
      } catch (e) {
        errors.push(`scrape: ${(e as Error).message}`);
      }
    }
  }

  // 6. Distribute: fetch all unassigned New leads, assign per-setter up to quota
  const { data: pool } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("status", "New")
    .eq("retired", false)
    .eq("do_not_contact", false)
    .is("assigned_user_id", null)
    .order("created_at", { ascending: true });

  const poolIds = (pool ?? []).map((r) => r.id as string);
  let poolIdx = 0;

  for (const s of setters) {
    const have = newByUser.get(s.user_id) ?? 0;
    const need = Math.max(0, s.daily_lead_quota - have);
    const take = poolIds.slice(poolIdx, poolIdx + need);
    poolIdx += take.length;
    let assigned = 0;
    if (take.length > 0) {
      const { error: aErr } = await supabaseAdmin
        .from("leads")
        .update({ assigned_user_id: s.user_id })
        .in("id", take);
      if (aErr) errors.push(`assign(${s.user_id}): ${aErr.message}`);
      else assigned = take.length;
    }
    result.distributed += assigned;
    result.perSetter.push({
      user_id: s.user_id,
      name: s.full_name,
      needed: need,
      assigned,
      shortfall: Math.max(0, need - assigned),
    });
  }

  // 7. Log run
  await supabaseAdmin.from("scraper_runs").insert({
    user_id: opts.triggeredBy,
    leads_added: result.inserted,
    status: errors.length === 0 ? "success" : (result.distributed > 0 ? "partial" : "failed"),
    phase: "full",
    details: JSON.parse(JSON.stringify(result)),
  });

  return result;
}
