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
    };
  };
};

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
        } else if (type.startsWith("call.")) {
          const update: Record<string, unknown> = {
            status: obj.status ?? null,
          };
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
