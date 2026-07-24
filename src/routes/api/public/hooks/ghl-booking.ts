import { createFileRoute } from "@tanstack/react-router";

// Public webhook: GoHighLevel workflow "Custom Webhook" -> appointment sync.
// Auth: shared secret via ?secret= or x-webhook-secret header (GHL_WEBHOOK_SECRET).
// Never returns non-200 on missing/unmatched data (GHL retries on failure).

type AnyRec = Record<string, unknown>;

function pick(obj: AnyRec | undefined | null, ...paths: string[]): unknown {
  if (!obj) return undefined;
  for (const p of paths) {
    const parts = p.split(".");
    let cur: unknown = obj;
    for (const k of parts) {
      if (cur && typeof cur === "object" && k in (cur as AnyRec)) {
        cur = (cur as AnyRec)[k];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normEmail(v: unknown): string | null {
  const s = str(v);
  return s ? s.toLowerCase() : null;
}

function phoneLast10(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-10);
}

function normalizeIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const Route = createFileRoute("/api/public/hooks/ghl-booking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const provided =
          request.headers.get("x-webhook-secret") ||
          url.searchParams.get("secret") ||
          "";
        const expected = process.env.GHL_WEBHOOK_SECRET;
        if (!expected || provided !== expected) {
          return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
        }

        let raw: unknown = null;
        try {
          raw = await request.json();
        } catch {
          const text = await request.text().catch(() => "");
          try { raw = JSON.parse(text); } catch { raw = { _raw: text }; }
        }
        console.log("[ghl-booking-webhook] payload:", JSON.stringify(raw));

        const body = (raw && typeof raw === "object" ? raw : {}) as AnyRec;
        const customData = (body.customData as AnyRec) || {};
        const contact = (body.contact as AnyRec) || {};
        const appointment = (body.appointment as AnyRec) || {};
        const calendar = (body.calendar as AnyRec) || {};

        const evtRaw = str(
          pick(body, "event_type", "customData.event_type", "type", "eventType") ||
          pick(customData, "event_type", "type"),
        );
        const event = (evtRaw ?? "booked").toLowerCase();
        const action: "booked" | "rescheduled" | "cancelled" =
          event.includes("cancel") ? "cancelled"
          : event.includes("reschedul") ? "rescheduled"
          : "booked";

        const email = normEmail(
          pick(body, "email", "contact.email", "customData.email"),
        );
        const phone = str(
          pick(body, "phone", "contact.phone", "customData.phone"),
        );
        const phoneKey = phoneLast10(phone);

        const firstName = str(pick(body, "first_name", "firstName", "contact.first_name", "contact.firstName"));
        const lastName = str(pick(body, "last_name", "lastName", "contact.last_name", "contact.lastName"));
        const fullName = str(pick(body, "full_name", "fullName", "name", "contact.full_name", "contact.name"))
          || [firstName, lastName].filter(Boolean).join(" ").trim() || null;

        const scheduledAt = normalizeIso(pick(
          body,
          "appointment.startTime", "appointment.start_time", "appointment.start",
          "calendar.startTime", "calendar.start_time",
          "start_time", "startTime", "appointment_start_time", "startDate",
          "customData.start_time", "customData.startTime",
        ));
        const endAt = normalizeIso(pick(
          body,
          "appointment.endTime", "appointment.end_time",
          "calendar.endTime", "calendar.end_time",
          "end_time", "endTime", "appointment_end_time",
        ));
        const title = str(pick(
          body,
          "appointment.title", "calendar.title", "calendar.name", "appointment.name",
          "title", "customData.title",
        ));
        const meetingUrl = str(pick(
          body,
          "appointment.address", "appointment.meetingLocation", "appointment.meeting_url",
          "meeting_url", "meetingUrl", "location", "customData.meeting_url",
        ));
        const timezone = str(pick(body, "timezone", "appointment.timezone", "contact.timezone", "customData.timezone"));
        const ghlApptId = str(pick(
          body,
          "appointment.id", "appointmentId", "appointment_id",
          "calendar.appointmentId", "customData.appointment_id",
        ));
        const apptStatus = str(pick(body, "appointment.status", "status", "appointment.appointmentStatus"));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ---------- Lead matching helpers ----------
        async function findInLeads() {
          if (email) {
            const { data } = await supabaseAdmin
              .from("leads")
              .select("id, email, phone, name, assigned_user_id, status")
              .ilike("email", email)
              .limit(1)
              .maybeSingle();
            if (data) return data;
          }
          if (phoneKey) {
            const { data } = await supabaseAdmin
              .from("leads")
              .select("id, email, phone, name, assigned_user_id, status")
              .not("phone", "is", null)
              .ilike("phone", `%${phoneKey}%`)
              .limit(50);
            const match = (data ?? []).find((r) => phoneLast10(r.phone) === phoneKey);
            if (match) return match;
          }
          return null;
        }

        async function findInPool() {
          if (email) {
            const { data } = await supabaseAdmin
              .from("b2b_lead_pool")
              .select("id, email, phone, first_name, last_name, notes, status, claimed_by")
              .ilike("email", email)
              .limit(1)
              .maybeSingle();
            if (data) return data;
          }
          if (phoneKey) {
            const { data } = await supabaseAdmin
              .from("b2b_lead_pool")
              .select("id, email, phone, first_name, last_name, notes, status, claimed_by")
              .not("phone", "is", null)
              .ilike("phone", `%${phoneKey}%`)
              .limit(50);
            const match = (data ?? []).find((r) => phoneLast10(r.phone) === phoneKey);
            if (match) return match;
          }
          return null;
        }

        async function pickFallbackUserId(): Promise<string | null> {
          const { data } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin" as never)
            .limit(1)
            .maybeSingle();
          return (data as { user_id?: string } | null)?.user_id ?? null;
        }

        const lead = await findInLeads();
        if (lead) {
          const leadId = lead.id as string;
          const userId = (lead.assigned_user_id as string | null) ?? (await pickFallbackUserId());

          if (action === "cancelled") {
            // Find matching appointment
            let apptId: string | null = null;
            if (ghlApptId) {
              const { data } = await supabaseAdmin
                .from("appointments").select("id").eq("ghl_appointment_id", ghlApptId).maybeSingle();
              apptId = (data?.id as string | undefined) ?? null;
            }
            if (!apptId) {
              const { data } = await supabaseAdmin
                .from("appointments").select("id").eq("lead_id", leadId)
                .neq("status", "cancelled").order("scheduled_at", { ascending: false })
                .limit(1).maybeSingle();
              apptId = (data?.id as string | undefined) ?? null;
            }
            if (apptId) {
              await supabaseAdmin.from("appointments").update({ status: "cancelled" }).eq("id", apptId);
            }
            if (lead.status === "Booked") {
              await supabaseAdmin.from("leads")
                .update({ status: "Interested" as never, last_status_change_at: new Date().toISOString() })
                .eq("id", leadId);
            }
            return Response.json({ matched: true, table: "leads", lead_id: leadId, action });
          }

          if (action === "rescheduled") {
            let apptId: string | null = null;
            if (ghlApptId) {
              const { data } = await supabaseAdmin
                .from("appointments").select("id").eq("ghl_appointment_id", ghlApptId).maybeSingle();
              apptId = (data?.id as string | undefined) ?? null;
            }
            if (!apptId) {
              const { data } = await supabaseAdmin
                .from("appointments").select("id").eq("lead_id", leadId)
                .neq("status", "cancelled").order("scheduled_at", { ascending: false })
                .limit(1).maybeSingle();
              apptId = (data?.id as string | undefined) ?? null;
            }
            if (apptId && scheduledAt) {
              const patch: AnyRec = { scheduled_at: scheduledAt, status: "scheduled" };
              if (meetingUrl) patch.meeting_url = meetingUrl;
              if (timezone) patch.timezone = timezone;
              if (title) patch.context = title;
              if (ghlApptId) patch.ghl_appointment_id = ghlApptId;
              await supabaseAdmin.from("appointments").update(patch as never).eq("id", apptId);
            } else if (scheduledAt && userId) {
              // No existing appointment; treat like booked
              await insertAppt();
            }
            await supabaseAdmin.from("leads")
              .update({ status: "Booked" as never, last_status_change_at: new Date().toISOString() })
              .eq("id", leadId);
            return Response.json({ matched: true, table: "leads", lead_id: leadId, action });
          }

          // action === "booked"
          await supabaseAdmin.from("leads")
            .update({ status: "Booked" as never, last_status_change_at: new Date().toISOString() })
            .eq("id", leadId);
          await insertAppt();
          return Response.json({ matched: true, table: "leads", lead_id: leadId, action });

          async function insertAppt() {
            if (!scheduledAt) {
              console.warn("[ghl-booking-webhook] no scheduled_at; skipping appointment upsert");
              return;
            }
            if (!userId) {
              console.warn("[ghl-booking-webhook] no user_id available; skipping appointment upsert");
              return;
            }
            // Match existing: prefer ghl_appointment_id, else lead_id+scheduled_at.
            let existingId: string | null = null;
            if (ghlApptId) {
              const { data } = await supabaseAdmin
                .from("appointments").select("id").eq("ghl_appointment_id", ghlApptId).maybeSingle();
              existingId = (data?.id as string | undefined) ?? null;
            }
            if (!existingId) {
              const { data } = await supabaseAdmin
                .from("appointments").select("id").eq("lead_id", leadId).eq("scheduled_at", scheduledAt).maybeSingle();
              existingId = (data?.id as string | undefined) ?? null;
            }
            const payload: AnyRec = {
              lead_id: leadId,
              user_id: userId,
              name: fullName ?? ((lead as AnyRec).name as string) ?? "Lead",
              email: email ?? ((lead as AnyRec).email as string | null),
              phone: phone ?? ((lead as AnyRec).phone as string | null),
              scheduled_at: scheduledAt,
              status: apptStatus?.toLowerCase() === "cancelled" ? "cancelled" : "scheduled",
              type: "booking",
              context: title,
              meeting_url: meetingUrl,
              timezone,
              ghl_appointment_id: ghlApptId,
            };
            if (existingId) {
              await supabaseAdmin.from("appointments").update(payload as never).eq("id", existingId);
            } else {
              await supabaseAdmin.from("appointments").insert(payload as never);
            }
          }
        }

        const pool = await findInPool();
        if (pool) {
          const poolId = pool.id as string;
          if (action === "booked" || action === "rescheduled") {
            const stamp = new Date().toISOString();
            const noteLine = `[${stamp}] GHL ${action}${scheduledAt ? ` @ ${scheduledAt}` : ""}${title ? ` (${title})` : ""}${meetingUrl ? ` ${meetingUrl}` : ""}`;
            const nextNotes = [pool.notes as string | null, noteLine].filter(Boolean).join("\n");
            await supabaseAdmin.from("b2b_lead_pool")
              .update({ status: "booked" as never, notes: nextNotes })
              .eq("id", poolId);
          } else if (action === "cancelled") {
            const stamp = new Date().toISOString();
            const noteLine = `[${stamp}] GHL cancelled${scheduledAt ? ` @ ${scheduledAt}` : ""}`;
            const nextNotes = [pool.notes as string | null, noteLine].filter(Boolean).join("\n");
            await supabaseAdmin.from("b2b_lead_pool")
              .update({ notes: nextNotes })
              .eq("id", poolId);
          }
          return Response.json({ matched: true, table: "b2b_lead_pool", lead_id: poolId, action });
        }

        console.log("[ghl-booking-webhook] no match", { email, phoneKey, action });
        return Response.json({ matched: false, action });
      },
    },
  },
});
