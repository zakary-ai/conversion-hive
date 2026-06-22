import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// OpenPhone webhook receiver.
// Configure in OpenPhone: Settings → Webhooks → add this URL with events:
//   call.completed, call.recording.completed
// OpenPhone signs each request with HMAC-SHA256 of the raw body using your
// webhook signing secret. Header: `openphone-signature` in the form
// `hmac;<version>;<timestamp>;<base64-signature>` (we accept the signature
// alone or the full header).

function verify(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = header.split(";");
  const sigB64 = parts[parts.length - 1]?.trim();
  const timestamp = parts.length >= 3 ? parts[parts.length - 2]?.trim() : "";
  if (!sigB64) return false;
  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const expected = createHmac("sha256", secret).update(signedPayload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, "base64");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

type OpenPhoneTranscriptDialogue = { identifier?: string; userId?: string; content?: string; text?: string; start?: number };
type OpenPhoneEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      status?: string;
      direction?: string;
      from?: string;
      to?: string | string[];
      duration?: number;
      createdAt?: string;
      completedAt?: string;
      answeredAt?: string;
      url?: string;
      media?: Array<{ url?: string; type?: string }>;
      callId?: string;
      // transcript-shaped fields
      dialogue?: OpenPhoneTranscriptDialogue[];
      text?: string;
      transcript?: string;
      // summary-shaped fields
      summary?: string | string[];
      nextSteps?: string[];
    };
  };
};

function formatTranscript(obj: NonNullable<OpenPhoneEvent["data"]>["object"]): string | null {
  if (!obj) return null;
  if (Array.isArray(obj.dialogue) && obj.dialogue.length > 0) {
    return obj.dialogue
      .map((d) => {
        const speaker = d.identifier || d.userId || "Speaker";
        const line = d.content || d.text || "";
        return `${speaker}: ${line}`.trim();
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof obj.transcript === "string") return obj.transcript;
  if (typeof obj.text === "string") return obj.text;
  return null;
}

function formatSummary(obj: NonNullable<OpenPhoneEvent["data"]>["object"]): string | null {
  if (!obj) return null;
  const parts: string[] = [];
  if (Array.isArray(obj.summary)) parts.push(obj.summary.join("\n"));
  else if (typeof obj.summary === "string") parts.push(obj.summary);
  if (Array.isArray(obj.nextSteps) && obj.nextSteps.length > 0) {
    parts.push("Next steps:\n- " + obj.nextSteps.join("\n- "));
  }
  return parts.length ? parts.join("\n\n") : null;
}

async function opGet(path: string): Promise<unknown | null> {
  const key = process.env.OPENPHONE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.openphone.com${path}`, {
      headers: { Authorization: key },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function backfillCallArtifacts(callId: string): Promise<void> {
  // Give OpenPhone a moment to finish processing
  await new Promise((r) => setTimeout(r, 8000));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const patch: { recording_url?: string; transcript?: string; transcript_status?: string; summary?: string } = {};

  type RecRes = { data?: Array<{ url?: string; media?: Array<{ url?: string }> }> };
  const rec = (await opGet(`/v1/call-recordings/${encodeURIComponent(callId)}`)) as RecRes | null;
  const recUrl = rec?.data?.[0]?.url || rec?.data?.[0]?.media?.[0]?.url;
  if (recUrl) patch.recording_url = recUrl;

  type TxRes = { data?: { status?: string; dialogue?: OpenPhoneTranscriptDialogue[]; text?: string; transcript?: string } };
  const tx = (await opGet(`/v1/call-transcripts/${encodeURIComponent(callId)}`)) as TxRes | null;
  if (tx?.data) {
    const t = formatTranscript(tx.data as NonNullable<OpenPhoneEvent["data"]>["object"]);
    if (t) patch.transcript = t;
    if (tx.data.status) patch.transcript_status = tx.data.status;
  }

  type SumRes = { data?: { summary?: string | string[]; nextSteps?: string[] } };
  const sum = (await opGet(`/v1/call-summaries/${encodeURIComponent(callId)}`)) as SumRes | null;
  if (sum?.data) {
    const s = formatSummary(sum.data as NonNullable<OpenPhoneEvent["data"]>["object"]);
    if (s) patch.summary = s;
  }

  if (Object.keys(patch).length === 0) return;
  await supabaseAdmin.from("call_logs").update(patch).eq("openphone_call_id", callId);
}

export const Route = createFileRoute("/api/public/hooks/openphone")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.OPENPHONE_WEBHOOK_SECRET;
        const raw = await request.text();

        if (secret) {
          const sig = request.headers.get("openphone-signature") || request.headers.get("x-openphone-signature");
          if (!verify(raw, sig, secret)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: OpenPhoneEvent;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const obj = payload.data?.object;
        if (!obj?.id && !obj?.callId) return Response.json({ ok: true, skipped: true });

        const callId = obj.callId || obj.id!;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Make sure a call_logs row exists for this openphone_call_id. Our app
        // inserts a row at dial-time with openphone_call_id=null (the id isn't
        // known yet). On the first webhook event for a real call we adopt the
        // most recent un-linked dial that targets the same phone number so
        // recordings and transcripts land on it.
        {
          const { data: existing } = await supabaseAdmin
            .from("call_logs")
            .select("id")
            .eq("openphone_call_id", callId)
            .maybeSingle();
          if (!existing) {
            const toRaw = Array.isArray(obj.to) ? obj.to[0] : obj.to;
            const toDigits = (toRaw ?? "").replace(/\D/g, "").slice(-10);
            if (toDigits) {
              const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
              const { data: candidates } = await supabaseAdmin
                .from("call_logs")
                .select("id, to_number")
                .is("openphone_call_id", null)
                .gte("started_at", sinceIso)
                .order("started_at", { ascending: false })
                .limit(20);
              const match = (candidates ?? []).find(
                (r) => (r.to_number ?? "").replace(/\D/g, "").slice(-10) === toDigits,
              );
              if (match) {
                const adopt: { openphone_call_id: string; from_number?: string; direction?: string } = {
                  openphone_call_id: callId,
                };
                if (typeof obj.from === "string") adopt.from_number = obj.from;
                if (typeof obj.direction === "string") adopt.direction = obj.direction;
                await supabaseAdmin.from("call_logs").update(adopt).eq("id", match.id);
              }
            }
          }
        }

        const type = payload.type ?? "";

        if (type.startsWith("call.recording")) {
          const recordingUrl = obj.url || obj.media?.[0]?.url;
          if (recordingUrl) {
            await supabaseAdmin
              .from("call_logs")
              .update({ recording_url: recordingUrl })
              .eq("openphone_call_id", callId);
          }
        } else if (type.startsWith("call.transcript")) {
          const transcript = formatTranscript(obj);
          await supabaseAdmin
            .from("call_logs")
            .update({
              transcript: transcript,
              transcript_status: obj.status ?? "completed",
            })
            .eq("openphone_call_id", callId);
        } else if (type.startsWith("call.summary")) {
          const summary = formatSummary(obj);
          if (summary) {
            await supabaseAdmin
              .from("call_logs")
              .update({ summary })
              .eq("openphone_call_id", callId);
          }
        } else if (type.startsWith("call.")) {
          const update: {
            status: string | null;
            duration_sec?: number;
            started_at?: string;
            ended_at?: string;
          } = { status: obj.status ?? null };
          if (typeof obj.duration === "number") update.duration_sec = obj.duration;
          if (obj.answeredAt) update.started_at = obj.answeredAt;
          if (obj.completedAt) update.ended_at = obj.completedAt;
          await supabaseAdmin
            .from("call_logs")
            .update(update)
            .eq("openphone_call_id", callId);

          // After a call completes, backfill recording + transcript + summary via REST.
          // Recordings/transcripts can finish processing after the completed event fires,
          // so we re-query a few seconds later; non-fatal if any are missing.
          if (type === "call.completed" || obj.status === "completed") {
            void backfillCallArtifacts(callId).catch((e) => console.error("openphone backfill", e));
          }
        }

        return Response.json({ ok: true });
      },
      GET: async () => Response.json({ ok: true, hint: "POST OpenPhone webhook events here" }),
    },
  },
});
