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
        }

        return Response.json({ ok: true });
      },
      GET: async () => Response.json({ ok: true, hint: "POST OpenPhone webhook events here" }),
    },
  },
});
