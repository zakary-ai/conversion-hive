import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

// JustCall webhook receiver.
// Configure in JustCall: Settings → Developers/Webhooks. Paste the URL shown on
// the admin JustCall page (it carries a `?t=<token>` shared secret) and enable
// call events (ringing / answered / completed).
//
// The instant JustCall reports a ringing/answered call we write a row into
// `b2b_live_calls`, which Realtime pushes to that setter's open dialer tab.

function tokenOk(provided: string | null): boolean {
  const secret = process.env["JUSTCALL_WEBHOOK_SECRET"];
  if (!secret) return false;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type AnyRec = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;

function pick(obj: AnyRec | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = str(obj[k]);
    if (v) return v;
  }
  return null;
}

function pickNum(obj: AnyRec | null, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/** Map a JustCall event/status string onto our simple state machine. */
function toState(raw: string | null): "ringing" | "answered" | "completed" {
  const s = (raw ?? "").toLowerCase();
  if (/complete|ended|hangup|disconnect|missed|voicemail|no[-_ ]?answer|failed/.test(s)) return "completed";
  if (/answer|connect|in[-_ ]?progress|live|ongoing|bridge/.test(s)) return "answered";
  return "ringing";
}

const last10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

export const Route = createFileRoute("/api/public/hooks/justcall")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, hint: "POST JustCall webhook events here" }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const provided =
          url.searchParams.get("t") ||
          request.headers.get("x-justcall-token") ||
          request.headers.get("x-webhook-token");
        if (!tokenOk(provided)) return new Response("Unauthorized", { status: 401 });

        let payload: AnyRec;
        try {
          payload = (await request.json()) as AnyRec;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        // JustCall nests the useful fields differently per event type; flatten.
        const data = (payload.data ?? payload) as AnyRec;
        const callInfo = (data.call_info ?? data.call ?? {}) as AnyRec;
        const contactInfo = (data.contact_info ?? data.contact ?? {}) as AnyRec;
        const merged: AnyRec = { ...payload, ...data, ...callInfo, ...contactInfo };

        const callId =
          pick(merged, ["call_id", "callId", "id", "call_sid", "unique_id"]) ?? null;
        const eventType =
          pick(payload, ["type", "event", "event_type"]) ??
          pick(merged, ["type", "event", "event_type", "call_status", "status", "call_state"]);
        const state = toState(
          pick(merged, ["call_status", "status", "call_state"]) ?? eventType,
        );

        const direction =
          (pick(merged, ["direction", "call_type", "type_of_call"]) ?? "outbound")
            .toLowerCase()
            .includes("in")
            ? "inbound"
            : "outbound";

        const contactNumber =
          pick(merged, [
            "contact_number",
            "client_number",
            "customer_number",
            "to",
            "to_number",
            "phone",
            "contact_phone",
          ]) ?? null;
        const justcallNumber =
          pick(merged, ["justcall_number", "justcall_line", "from", "from_number", "agent_number"]) ?? null;

        const agentEmail = pick(merged, ["agent_email", "user_email", "email"]);
        const agentId = pick(merged, ["agent_id", "user_id", "justcall_agent_id"]);
        const durationSec = pickNum(merged, ["call_duration", "duration", "talk_time", "duration_sec"]);
        const recordingUrl = pick(merged, ["recording_url", "call_recording", "recording"]);
        const transcript = pick(merged, ["transcription", "transcript"]);
        const summary = pick(merged, ["call_summary", "summary", "ai_summary"]);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ---- Resolve the setter -------------------------------------------------
        let setterId: string | null = null;
        if (agentEmail || agentId) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("user_id, justcall_agent_id, justcall_agent_email, justcall_number_e164, email")
            .or(
              [
                agentId ? `justcall_agent_id.eq.${agentId}` : null,
                agentEmail ? `justcall_agent_email.ilike.${agentEmail}` : null,
                agentEmail ? `email.ilike.${agentEmail}` : null,
              ]
                .filter(Boolean)
                .join(","),
            )
            .limit(1);
          setterId = profs?.[0]?.user_id ?? null;
        }
        if (!setterId && justcallNumber) {
          const d = last10(justcallNumber);
          if (d) {
            const { data: byNum } = await supabaseAdmin
              .from("profiles")
              .select("user_id, justcall_number_e164")
              .not("justcall_number_e164", "is", null)
              .limit(500);
            setterId = (byNum ?? []).find((p) => last10(p.justcall_number_e164) === d)?.user_id ?? null;
          }
        }

        // ---- Resolve the lead by phone digits ----------------------------------
        let poolLeadId: string | null = null;
        const contactDigits = last10(contactNumber);
        if (contactDigits) {
          const { data: pl } = await supabaseAdmin
            .from("b2b_lead_pool")
            .select("id, claimed_by")
            .ilike("phone", `%${contactDigits}`)
            .limit(1)
            .maybeSingle();
          if (pl) {
            poolLeadId = pl.id;
            if (!setterId && pl.claimed_by) setterId = pl.claimed_by;
          }
        }

        if (!setterId) {
          // Nothing we can attribute this to — acknowledge so JustCall doesn't retry.
          return Response.json({ ok: true, skipped: "unmapped_agent" });
        }

        const nowIso = new Date().toISOString();

        // ---- Live call row (drives the instant screen pop) ---------------------
        const livePatch: Record<string, unknown> = {
          setter_id: setterId,
          pool_lead_id: poolLeadId,
          justcall_call_id: callId,
          phone: contactNumber,
          direction,
          state,
          raw: payload as unknown as Record<string, unknown>,
        };
        if (state === "answered") livePatch.answered_at = nowIso;
        if (state === "completed") {
          livePatch.ended_at = nowIso;
          if (durationSec !== null) livePatch.duration_sec = Math.round(durationSec);
        }

        if (callId) {
          const { data: existingLive } = await supabaseAdmin
            .from("b2b_live_calls")
            .select("id")
            .eq("justcall_call_id", callId)
            .maybeSingle();
          if (existingLive) {
            await supabaseAdmin.from("b2b_live_calls").update(livePatch as any).eq("id", existingLive.id);
          } else {
            await supabaseAdmin.from("b2b_live_calls").insert(livePatch as never);
          }
        } else {
          await supabaseAdmin.from("b2b_live_calls").insert(livePatch as never);
        }

        // ---- Call log (history / stats) ----------------------------------------
        const logPatch: Record<string, unknown> = {
          user_id: setterId,
          pool_lead_id: poolLeadId,
          justcall_call_id: callId,
          direction,
          status: state,
          from_number: direction === "inbound" ? contactNumber : justcallNumber,
          to_number: direction === "inbound" ? justcallNumber : contactNumber,
        };
        if (durationSec !== null) logPatch.duration_sec = Math.round(durationSec);
        if (recordingUrl) logPatch.recording_url = recordingUrl;
        if (transcript) { logPatch.transcript = transcript; logPatch.transcript_status = "completed"; }
        if (summary) logPatch.summary = summary;
        if (state === "answered") logPatch.started_at = nowIso;
        if (state === "completed") logPatch.ended_at = nowIso;

        if (callId) {
          const { data: existingLog } = await supabaseAdmin
            .from("call_logs")
            .select("id")
            .eq("justcall_call_id", callId)
            .maybeSingle();
          if (existingLog) {
            await supabaseAdmin.from("call_logs").update(logPatch as never).eq("id", existingLog.id);
          } else {
            await supabaseAdmin
              .from("call_logs")
              .insert({ ...logPatch, started_at: logPatch.started_at ?? nowIso } as never);
          }
        }

        // Mark the lead as attempted so the setter's queues stay accurate.
        if (poolLeadId && state !== "ringing") {
          await supabaseAdmin
            .from("b2b_lead_pool")
            .update({ last_attempt_at: nowIso } as never)
            .eq("id", poolLeadId);
        }

        return Response.json({ ok: true, state, matched_lead: Boolean(poolLeadId) });
      },
    },
  },
});
