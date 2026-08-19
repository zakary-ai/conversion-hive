import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function requireManager(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from("dm_setters") as any)
    .select("id, full_name, email, is_manager, booking_slug")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.is_manager) throw new Error("Not a DM setter manager");
  let slug = data.booking_slug as string | null;
  if (!slug) {
    const { slugifyName } = await import("@/lib/dm-manager-booking.server");
    slug = slugifyName(data.full_name || data.email || "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("dm_setters") as any).update({ booking_slug: slug }).eq("id", data.id);
  }
  return { id: data.id as string, full_name: (data.full_name as string | null) ?? null, slug };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/* -------------------------------------------------------------------------- */
/*  Public booking link (/call/$slug)                                          */
/* -------------------------------------------------------------------------- */

export const getPublicManagerBySlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().trim().min(1).max(120) }).parse)
  .handler(async ({ data }) => {
    const { getManagerBySlug } = await import("@/lib/dm-manager-booking.server");
    const m = await getManagerBySlug(data.slug);
    if (!m) return null;
    return { slug: m.booking_slug, managerName: m.full_name };
  });

export const listPublicManagerSlots = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    slug: z.string().trim().min(1).max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse)
  .handler(async ({ data }) => {
    const { getManagerBySlug, computeManagerSlots } = await import("@/lib/dm-manager-booking.server");
    const m = await getManagerBySlug(data.slug);
    if (!m) return [] as string[];
    return computeManagerSlots(m.id, data.date);
  });

export const bookPublicManagerSlot = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    slug: z.string().trim().min(1).max(120),
    scheduled_at: z.string().datetime(),
    timezone: z.string().max(60).optional(),
    name: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(50).optional(),
  }).parse)
  .handler(async ({ data }) => {
    const { getManagerBySlug, createManagerBooking } = await import("@/lib/dm-manager-booking.server");
    const m = await getManagerBySlug(data.slug);
    if (!m) throw new Error("This booking link is no longer active.");
    const res = await createManagerBooking({
      managerId: m.id,
      managerName: m.full_name,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      scheduledAt: data.scheduled_at,
      timezone: data.timezone ?? null,
    });
    return { ok: true, managerName: m.full_name, ...res };
  });

/* -------------------------------------------------------------------------- */
/*  Manager: own calendar + availability                                       */
/* -------------------------------------------------------------------------- */

export const getMyManagerCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { managerBookingLink, getManagerRules } = await import("@/lib/dm-manager-booking.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookings } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .select("*").eq("manager_id", me.id).order("scheduled_at", { ascending: true });
    const rules = await getManagerRules(me.id);
    return {
      manager: { id: me.id, full_name: me.full_name, slug: me.slug, link: managerBookingLink(me.slug) },
      rules,
      bookings: bookings ?? [],
    };
  });

export const saveMyManagerAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    rules: z.array(z.object({
      day_of_week: z.number().int().min(0).max(6),
      start_minute: z.number().int().min(0).max(1440),
      end_minute: z.number().int().min(0).max(1440),
    })).max(40),
  }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clean = data.rules.filter((r) => r.end_minute > r.start_minute);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("dm_manager_availability_rules") as any).delete().eq("manager_id", me.id);
    if (clean.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin.from("dm_manager_availability_rules") as any)
        .insert(clean.map((r) => ({ ...r, manager_id: me.id })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateMyManagerBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    status: z.enum(["scheduled", "completed", "cancelled", "no_show"]).optional(),
    outcome: z.string().max(200).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .update(patch).eq("id", id).eq("manager_id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Manager: team-only training modules                                        */
/* -------------------------------------------------------------------------- */

export const listMyManagerModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin.from("modules") as any)
      .select("*").eq("owner_manager_id", me.id).order("order_index");
    return data ?? [];
  });

export const createManagerVideoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ filename: z.string().trim().min(1).max(200) }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `manager/${me.id}/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("module-videos").createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message || "Could not start upload");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const saveManagerModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    video_url: z.string().max(500).nullable().optional(),
    order_index: z.number().int().default(0),
    is_active: z.boolean().default(true),
  }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    if (id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin.from("modules") as any)
        .update(rest).eq("id", id).eq("owner_manager_id", me.id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin.from("modules") as any)
      .insert({ ...rest, owner_manager_id: me.id }).select("id").single();
    if (error || !row) throw new Error(error?.message || "Could not save module");
    return { ok: true, id: row.id as string };
  });

export const deleteManagerModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("modules") as any)
      .delete().eq("id", data.id).eq("owner_manager_id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Admin: every manager calendar                                              */
/* -------------------------------------------------------------------------- */

export const adminListManagerCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { managerBookingLink, slugifyName } = await import("@/lib/dm-manager-booking.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: managers } = await (supabaseAdmin.from("dm_setters") as any)
      .select("id, full_name, email, booking_slug").eq("is_manager", true).order("full_name");
    const rows = (managers ?? []) as { id: string; full_name: string | null; email: string | null; booking_slug: string | null }[];

    for (const m of rows) {
      if (!m.booking_slug) {
        m.booking_slug = slugifyName(m.full_name || m.email || "manager");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin.from("dm_setters") as any).update({ booking_slug: m.booking_slug }).eq("id", m.id);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookings } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .select("*").order("scheduled_at", { ascending: false }).limit(500);

    return rows.map((m) => ({
      ...m,
      link: managerBookingLink(m.booking_slug as string),
      bookings: ((bookings ?? []) as { manager_id: string }[]).filter((b) => b.manager_id === m.id),
    }));
  });

/* -------------------------------------------------------------------------- */
/*  Manager Zoom credentials                                                   */
/* -------------------------------------------------------------------------- */

export const getMyManagerZoom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin.from("dm_manager_zoom_credentials") as any)
      .select("zoom_account_id, zoom_client_id, zoom_client_secret, zoom_host_email")
      .eq("manager_id", me.id)
      .maybeSingle();
    return {
      configured: Boolean(data?.zoom_account_id && data?.zoom_client_id && data?.zoom_client_secret),
      zoom_account_id: (data?.zoom_account_id as string | null) ?? "",
      zoom_client_id: (data?.zoom_client_id as string | null) ?? "",
      zoom_host_email: (data?.zoom_host_email as string | null) ?? "",
      // never return the secret to the browser
      has_secret: Boolean(data?.zoom_client_secret),
    };
  });

export const saveMyManagerZoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    zoom_account_id: z.string().trim().max(200),
    zoom_client_id: z.string().trim().max(200),
    zoom_client_secret: z.string().trim().max(400).optional(),
    zoom_host_email: z.string().trim().max(200).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      manager_id: me.id,
      zoom_account_id: data.zoom_account_id || null,
      zoom_client_id: data.zoom_client_id || null,
      zoom_host_email: data.zoom_host_email?.trim() ? data.zoom_host_email.trim().toLowerCase() : null,
      updated_at: new Date().toISOString(),
    };
    // Blank secret means "keep the existing one".
    if (data.zoom_client_secret) patch["zoom_client_secret"] = data.zoom_client_secret;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("dm_manager_zoom_credentials") as any)
      .upsert(patch, { onConflict: "manager_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testMyManagerZoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creds } = await (supabaseAdmin.from("dm_manager_zoom_credentials") as any)
      .select("zoom_account_id, zoom_client_id, zoom_client_secret, zoom_host_email")
      .eq("manager_id", me.id)
      .maybeSingle();
    if (!creds?.zoom_account_id || !creds?.zoom_client_id || !creds?.zoom_client_secret) {
      throw new Error("Add your Zoom Account ID, Client ID and Client Secret first.");
    }
    const { createZoomMeetingOnCloserAccount } = await import("@/lib/b2b-booking.server");
    const url = await createZoomMeetingOnCloserAccount({
      accountId: creds.zoom_account_id as string,
      clientId: creds.zoom_client_id as string,
      clientSecret: creds.zoom_client_secret as string,
      hostEmail: (creds.zoom_host_email as string | null) ?? null,
      topic: "Zoom connection test",
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      duration: 15,
    });
    if (!url) throw new Error("Zoom rejected those credentials. Double-check the Server-to-Server OAuth app values.");
    return { ok: true, url };
  });
