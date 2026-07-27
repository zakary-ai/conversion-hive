import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  authorizeAppUserOAuth,
  exchangeAppUserOAuthCode,
  disconnectAppUser,
} from "@/integrations/lovable/appUserConnector";

const GCAL_CONNECTOR_ID = "google_calendar";
const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientAPIKey = process.env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientAPIKey) throw new Error("Google Calendar connector client is not configured.");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const returnUrl = new URL("/oauth/google-calendar/return", request.url).toString();

    const { getConnectionKeyForUser } = await import("@/lib/googleCalendar.server");
    const existing = await getConnectionKeyForUser(context.userId, GCAL_CONNECTOR_ID);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: GCAL_CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().min(1) }).parse)
  .handler(async ({ data, context }) => {
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== GCAL_CONNECTOR_ID) {
      throw new Error("OAuth completion returned the wrong connector");
    }
    const { saveConnectionKeyForUser } = await import("@/lib/googleCalendar.server");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionKeyForUser } = await import(
      "@/lib/googleCalendar.server"
    );
    const key = await getConnectionKeyForUser(context.userId, GCAL_CONNECTOR_ID);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: GCAL_CONNECTOR_ID,
        });
      } catch (e) {
        console.error("google_calendar gateway disconnect failed:", e);
      }
    }
    await deleteConnectionKeyForUser(context.userId, GCAL_CONNECTOR_ID);
    return { ok: true };
  });

export const getMyGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/lib/googleCalendar.server");
    const key = await getConnectionKeyForUser(context.userId, GCAL_CONNECTOR_ID);
    return { connected: !!key };
  });
