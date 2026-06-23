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
  supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "client" }) => unknown },
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
  .inputValidator(z.object({ lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead } = await supabase
      .from("leads").select("id, phone, name").eq("id", data.lead_id).maybeSingle();
    if (!lead) throw new Error("Lead not found");
    if (!lead.phone) throw new Error("Lead has no phone number");

    const toNumber = normalizeE164(lead.phone);

    const { data: log } = await supabase.from("call_logs").insert({
      lead_id: lead.id,
      user_id: userId,
      openphone_call_id: null,
      direction: "outbound",
      status: "initiated",
      from_number: null,
      to_number: toNumber,
      started_at: new Date().toISOString(),
    }).select("id").maybeSingle();

    await supabase.from("leads").update({ contacted_at: new Date().toISOString() }).eq("id", lead.id);

    return { ok: true, call_log_id: log?.id, dial: toNumber, from: null as string | null };
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
    const res = await fetch(`https://api.openphone.com${path}`, {
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

    const { data: rows, error } = await supabaseAdmin
      .from("call_logs")
      .select("id, openphone_call_id, transcript, recording_url, summary")
      .not("openphone_call_id", "is", null);
    if (error) throw new Error(error.message);

    let scanned = 0;
    let updated = 0;
    let txFilled = 0;
    let recFilled = 0;
    let sumFilled = 0;

    for (const row of rows ?? []) {
      scanned++;
      const callId = row.openphone_call_id as string;
      const patch: Record<string, string> = {};

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

    return { ok: true, scanned, updated, txFilled, recFilled, sumFilled };
  });
