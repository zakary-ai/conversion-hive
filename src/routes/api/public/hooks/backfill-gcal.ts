import { createFileRoute } from "@tanstack/react-router";

/**
 * Temporary one-off admin utility: pushes existing appointments onto the
 * assigned B2B closer's connected Google Calendar. Protected by a shared secret.
 */
export const Route = createFileRoute("/api/public/hooks/backfill-gcal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.BACKFILL_ADMIN_SECRET;
        if (!secret || request.headers.get("x-backfill-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const payload = (await request.json()) as { appointmentIds?: string[] };
        const ids = Array.isArray(payload.appointmentIds) ? payload.appointmentIds.slice(0, 20) : [];
        if (ids.length === 0) return Response.json({ error: "no ids" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createCalendarEventForUser } = await import("@/lib/googleCalendar.server");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rows, error } = await (supabaseAdmin.from("appointments") as any)
          .select("id, name, email, phone, scheduled_at, timezone, context, meeting_url, b2b_closer_id, status")
          .in("id", ids);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: settings } = await (supabaseAdmin.from("b2b_settings") as any)
          .select("slot_minutes").eq("id", 1).maybeSingle();
        const slotMinutes = (settings?.slot_minutes as number | null) ?? 30;

        const results: Array<Record<string, unknown>> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const appt of (rows ?? []) as any[]) {
          if (!appt.b2b_closer_id) {
            results.push({ id: appt.id, skipped: "no closer" });
            continue;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: closer } = await (supabaseAdmin.from("b2b_closers") as any)
            .select("user_id").eq("id", appt.b2b_closer_id).maybeSingle();
          const closerUserId = (closer?.user_id as string | null) ?? null;
          if (!closerUserId) {
            results.push({ id: appt.id, skipped: "closer has no user" });
            continue;
          }
          const start = new Date(appt.scheduled_at as string);
          const endISO = new Date(start.getTime() + slotMinutes * 60_000).toISOString();
          const descLines = [
            `Lead: ${appt.name}`,
            appt.email ? `Email: ${appt.email}` : null,
            appt.phone ? `Phone: ${appt.phone}` : null,
            appt.meeting_url ? `Zoom: ${appt.meeting_url}` : null,
            appt.context ? `\nNotes:\n${appt.context}` : null,
          ].filter(Boolean).join("\n");
          const eventId = await createCalendarEventForUser(closerUserId, {
            summary: `${appt.name} — Sales Call`,
            description: descLines,
            startISO: start.toISOString(),
            endISO,
            timezone: (appt.timezone as string | null) ?? null,
            attendees: appt.email ? [{ email: appt.email as string, displayName: appt.name as string }] : [],
            meetingUrl: (appt.meeting_url as string | null) ?? null,
          });
          results.push({ id: appt.id, eventId });
        }
        return Response.json({ results });
      },
    },
  },
});
