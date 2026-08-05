import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public (unauthenticated) booking endpoints backing each B2B setter's
// external booking link at /book/$slug. Availability and booking behaviour
// come from the shared B2B core, so a lead can only book what the setter
// could book internally.

export const getPublicSetterBySlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(120) }).parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabaseAdmin.from("profiles") as any)
      .select("user_id, full_name, b2b_booking_slug")
      .eq("b2b_booking_slug", data.slug.toLowerCase())
      .maybeSingle();
    if (!profile) return null;
    return {
      slug: profile.b2b_booking_slug as string,
      setterName: (profile.full_name as string | null) ?? null,
    };
  });

export const listPublicB2bSlots = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    slug: z.string().min(1).max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabaseAdmin.from("profiles") as any)
      .select("user_id").eq("b2b_booking_slug", data.slug.toLowerCase()).maybeSingle();
    if (!profile) return [] as string[];
    const { computeB2bSlots } = await import("@/lib/b2b-booking.server");
    return computeB2bSlots({ date: data.date, tz: data.tz });
  });

export const bookPublicB2bSlot = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    slug: z.string().min(1).max(120),
    scheduled_at: z.string().datetime(),
    timezone: z.string().max(60).optional(),
    first_name: z.string().trim().min(1).max(120),
    last_name: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(50).optional(),
    company: z.string().trim().max(200).optional(),
    note: z.string().trim().max(2000).optional(),
  }).parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabaseAdmin.from("profiles") as any)
      .select("user_id").eq("b2b_booking_slug", data.slug.toLowerCase()).maybeSingle();
    if (!profile?.user_id) throw new Error("This booking link is no longer active.");
    const setterUserId = profile.user_id as string;

    const email = data.email.toLowerCase();

    // Reuse the setter's existing pool lead for this email, otherwise create one
    // claimed by them so the booking is attributed correctly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabaseAdmin.from("b2b_lead_pool") as any)
      .select("id, first_name, last_name, email, phone, company")
      .eq("claimed_by", setterUserId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    const patch = {
      first_name: data.first_name,
      last_name: data.last_name || null,
      email,
      phone: data.phone || null,
      company: data.company || null,
    };

    let leadId: string;
    if (existing?.id) {
      leadId = existing.id as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("b2b_lead_pool") as any).update(patch).eq("id", leadId);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error } = await (supabaseAdmin.from("b2b_lead_pool") as any)
        .insert({
          ...patch,
          source: "setter_booking_link",
          lead_type: "inbound",
          status: "claimed",
          claimed_by: setterUserId,
          claimed_at: new Date().toISOString(),
          notes: data.note || null,
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message || "Could not save your details.");
      leadId = created.id as string;
    }

    const { bookB2bCore } = await import("@/lib/b2b-booking.server");
    const res = await bookB2bCore({
      lead: {
        id: leadId,
        first_name: patch.first_name,
        last_name: patch.last_name,
        email: patch.email,
        phone: patch.phone,
        company: patch.company,
      },
      setterUserId,
      scheduledAt: data.scheduled_at,
      timezone: data.timezone ?? null,
      note: data.note ?? null,
    });

    const { formatScheduledLabel } = await import("@/lib/b2b-booking.server");
    return {
      ok: true,
      scheduled_label: formatScheduledLabel(data.scheduled_at, data.timezone ?? null),
      closer_name: res.closer_name,
      meeting_url: res.meeting_url,
    };
  });
