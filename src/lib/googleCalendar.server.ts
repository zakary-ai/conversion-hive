// Server-only. Do NOT import from browser bundles.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";

export const GCAL_CONNECTOR_ID = "google_calendar";
export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

function cryptoKey(): Buffer {
  const raw = process.env.APP_USER_CONNECTION_KEY_SECRET;
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  return Buffer.from(raw, "base64");
}

export function encryptConnectionKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", cryptoKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as unknown as {
    from: (t: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from("app_user_connections")
    .upsert(
      {
        user_id: userId,
        connector_id: connectorId,
        connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector_id" },
    );
  if (error) throw new Error(error.message);
}

export async function getConnectionKeyForUser(
  userId: string,
  connectorId: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{
              data: { connection_key_ciphertext: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}

export async function deleteConnectionKeyForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as unknown as {
    from: (t: string) => {
      delete: () => {
        eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> };
      };
    };
  })
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

/**
 * Fetch busy windows for a single user's primary Google Calendar.
 * Returns [] if the user hasn't connected or the API errors out (fail-open —
 * we don't want a Google outage to block all bookings).
 */
export async function getBusyIntervalsForUser(
  userId: string,
  timeMinISO: string,
  timeMaxISO: string,
): Promise<Array<{ start: number; end: number }>> {
  const key = await getConnectionKeyForUser(userId, GCAL_CONNECTOR_ID);
  if (!key) return [];
  try {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: GCAL_CONNECTOR_ID,
      path: "/calendar/v3/freeBusy",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: timeMinISO,
          timeMax: timeMaxISO,
          items: [{ id: "primary" }],
        }),
      },
    });
    if (!res.ok) {
      console.error(`freeBusy failed for user ${userId}: ${res.status} ${await res.text()}`);
      return [];
    }
    const body = (await res.json()) as {
      calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
    };
    const busy = body.calendars?.primary?.busy ?? [];
    return busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));
  } catch (e) {
    console.error(`freeBusy error for user ${userId}:`, e);
    return [];
  }
}

/**
 * Create an event on the user's primary Google Calendar.
 * Returns the created event ID, or null if the user isn't connected or the API fails.
 */
export async function createCalendarEventForUser(
  userId: string,
  event: {
    summary: string;
    description?: string;
    startISO: string;
    endISO: string;
    timezone?: string | null;
    attendees?: Array<{ email: string; displayName?: string }>;
    meetingUrl?: string | null;
  },
): Promise<string | null> {
  const key = await getConnectionKeyForUser(userId, GCAL_CONNECTOR_ID);
  if (!key) return null;
  try {
    const body: Record<string, unknown> = {
      summary: event.summary,
      description: event.description ?? undefined,
      start: { dateTime: event.startISO, timeZone: event.timezone || "UTC" },
      end: { dateTime: event.endISO, timeZone: event.timezone || "UTC" },
    };
    if (event.attendees && event.attendees.length > 0) body.attendees = event.attendees;
    if (event.meetingUrl) body.location = event.meetingUrl;
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: GCAL_CONNECTOR_ID,
      path: "/calendar/v3/calendars/primary/events",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    });
    if (!res.ok) {
      console.error(`gcal insert failed for user ${userId}: ${res.status} ${await res.text()}`);
      return null;
    }
    const created = (await res.json()) as { id?: string };
    return created.id ?? null;
  } catch (e) {
    console.error(`gcal insert error for user ${userId}:`, e);
    return null;
  }
}
