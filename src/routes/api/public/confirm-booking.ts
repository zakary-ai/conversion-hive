import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ token: z.string().min(16).max(128) });

export const Route = createFileRoute("/api/public/confirm-booking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ ok: false, reason: "invalid_body" }, { status: 400 });
        }
        const parsed = Body.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ ok: false, reason: "invalid_token" }, { status: 400 });
        }
        const token = parsed.data.token;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: appt, error } = await (supabaseAdmin.from("appointments") as any)
          .select("id, name, scheduled_at, timezone, confirmed_at")
          .eq("confirmation_token", token)
          .maybeSingle();
        if (error) {
          return Response.json({ ok: false, reason: "lookup_failed" }, { status: 500 });
        }
        if (!appt) {
          return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
        }

        const firstName = String(appt.name || "").split(/\s+/)[0] || null;
        const tz = (appt.timezone as string | null) ?? "America/New_York";
        let scheduledLabel = String(appt.scheduled_at);
        try {
          scheduledLabel = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            weekday: "long", month: "long", day: "numeric", year: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
          }).format(new Date(appt.scheduled_at));
        } catch { /* ignore */ }

        if (appt.confirmed_at) {
          return Response.json({
            ok: true,
            alreadyConfirmed: true,
            leadName: firstName,
            scheduledLabel,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: uerr } = await (supabaseAdmin.from("appointments") as any)
          .update({ confirmed_at: new Date().toISOString() })
          .eq("id", appt.id);
        if (uerr) {
          return Response.json({ ok: false, reason: "update_failed" }, { status: 500 });
        }

        return Response.json({
          ok: true,
          alreadyConfirmed: false,
          leadName: firstName,
          scheduledLabel,
        });
      },
    },
  },
});
