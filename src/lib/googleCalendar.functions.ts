import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  authorizeAppUserOAuth,
  exchangeAppUserOAuthCode,
  disconnectAppUser,
} from "@/integrations/lovable/appUserConnector";

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const connectorId = "google_calendar";
    const gatewayBaseUrl = "https://connector-gateway.lovable.dev";
    const googleScopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ];
    const clientAPIKey = process.env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientAPIKey) throw new Error("Google Calendar connector client is not configured.");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const returnUrl = new URL("/oauth/google-calendar/return", request.url).toString();

    const { getConnectionKeyForUser } = await import("@/lib/googleCalendar.server");
    const existing = await getConnectionKeyForUser(context.userId, connectorId);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl,
      connectorId,
      appUserId: `${context.userId}:google_calendar`,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: googleScopes },
    });
    return { authorizationUrl };
  });

export const completeGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().min(1) }).parse)
  .handler(async ({ data, context }) => {
    const gatewayBaseUrl = "https://connector-gateway.lovable.dev";
    const { connectionAPIKey, connectorId: returnedConnectorId } = await exchangeAppUserOAuthCode(
      gatewayBaseUrl,
      data.code,
    );
    if (returnedConnectorId !== "google_calendar") {
      throw new Error("OAuth completion returned the wrong connector");
    }
    const { saveConnectionKeyForUser } = await import("@/lib/googleCalendar.server");
    await saveConnectionKeyForUser(context.userId, returnedConnectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const connectorId = "google_calendar";
    const gatewayBaseUrl = "https://connector-gateway.lovable.dev";
    const { getConnectionKeyForUser, deleteConnectionKeyForUser } = await import(
      "@/lib/googleCalendar.server"
    );
    const key = await getConnectionKeyForUser(context.userId, connectorId);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl,
          connectionAPIKey: key,
          connectorId,
        });
      } catch (e) {
        console.error("google_calendar gateway disconnect failed:", e);
      }
    }
    await deleteConnectionKeyForUser(context.userId, connectorId);
    return { ok: true };
  });

export const getMyGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const connectorId = "google_calendar";
    const { getConnectionKeyForUser } = await import("@/lib/googleCalendar.server");
    const key = await getConnectionKeyForUser(context.userId, connectorId);
    return { connected: !!key };
  });
