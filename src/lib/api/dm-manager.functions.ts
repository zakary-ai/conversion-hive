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

/* -------------------------------------------------------------------------- */
/*  Manager: their own closers                                                 */
/* -------------------------------------------------------------------------- */

async function requireOwnedCloser(managerId: string, closerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from("closers") as any)
    .select("id, full_name, email, active, owner_manager_id")
    .eq("id", closerId)
    .maybeSingle();
  if (!data || data.owner_manager_id !== managerId) throw new Error("That closer is not on your team.");
  return data as { id: string; full_name: string; email: string; active: boolean };
}

export const listMyClosers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin.from("closers") as any)
      .select("id, full_name, email, active, created_at")
      .eq("owner_manager_id", me.id)
      .order("full_name");
    const rows = (data ?? []) as { id: string }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creds } = await (supabaseAdmin.from("closer_zoom_credentials") as any)
      .select("closer_id, zoom_account_id, zoom_client_id, zoom_client_secret");
    const zoomOk = new Set(
      ((creds ?? []) as { closer_id: string; zoom_account_id: string | null; zoom_client_id: string | null; zoom_client_secret: string | null }[])
        .filter((c) => c.zoom_account_id && c.zoom_client_id && c.zoom_client_secret)
        .map((c) => c.closer_id),
    );
    return rows.map((r) => ({ ...r, has_zoom: zoomOk.has(r.id) }));
  });

export const inviteMyCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
  }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { DEFAULT_CLOSER_PASSWORD } = await import("@/lib/api/b2c.functions");
    const email = data.email.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabaseAdmin.from("closers") as any)
      .select("id, owner_manager_id").eq("email", email).maybeSingle();
    if (existing) throw new Error("Someone with that email is already a closer.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin.from("closers") as any)
      .insert({ full_name: data.full_name, email, owner_manager_id: me.id })
      .select("id").single();
    if (error || !row) throw new Error(error?.message || "Could not add that closer.");

    const { data: created, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: DEFAULT_CLOSER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (!userErr && created.user?.id) {
      await supabaseAdmin.from("profiles")
        .update({ must_change_password: true, full_name: data.full_name })
        .eq("user_id", created.user.id);
    }

    try {
      const { sendTransactional } = await import("@/lib/email/transactional.server");
      await sendTransactional({
        templateName: "closer-invite",
        recipientEmail: email,
        idempotencyKey: `closer-invite-${row.id}-${Date.now()}`,
        templateData: {
          closerName: data.full_name,
          email,
          password: DEFAULT_CLOSER_PASSWORD,
          loginUrl: "https://conversionlab.space/app/auth",
        },
      });
    } catch (e) {
      console.error("[inviteMyCloser] invite email failed", e);
    }

    return { id: row.id as string, default_password: DEFAULT_CLOSER_PASSWORD };
  });

export const updateMyCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid(), active: z.boolean() }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    await requireOwnedCloser(me.id, data.closer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closers") as any)
      .update({ active: data.active }).eq("id", data.closer_id).eq("owner_manager_id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    await requireOwnedCloser(me.id, data.closer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closers") as any)
      .delete().eq("id", data.closer_id).eq("owner_manager_id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyCloserAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    await requireOwnedCloser(me.id, data.closer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rules } = await (supabaseAdmin.from("closer_availability_rules") as any)
      .select("day_of_week, start_minute, end_minute")
      .eq("closer_id", data.closer_id)
      .eq("track", "b2c")
      .order("day_of_week");
    return (rules ?? []) as { day_of_week: number; start_minute: number; end_minute: number }[];
  });

export const saveMyCloserAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    closer_id: z.string().uuid(),
    rules: z.array(z.object({
      day_of_week: z.number().int().min(0).max(6),
      start_minute: z.number().int().min(0).max(1439),
      end_minute: z.number().int().min(1).max(1440),
    })).max(60),
  }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    await requireOwnedCloser(me.id, data.closer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clean = data.rules.filter((r) => r.end_minute > r.start_minute);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("closer_availability_rules") as any)
      .delete().eq("closer_id", data.closer_id).eq("track", "b2c");
    if (clean.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin.from("closer_availability_rules") as any)
        .insert(clean.map((r) => ({ ...r, closer_id: data.closer_id, track: "b2c" })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Manager: assign a booked call to one of their closers                      */
/* -------------------------------------------------------------------------- */

export const assignCloserToManagerBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid(), closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const closer = await requireOwnedCloser(me.id, data.closer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: booking } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .select("*").eq("id", data.booking_id).eq("manager_id", me.id).maybeSingle();
    if (!booking) throw new Error("Call not found on your calendar.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clash } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .select("id")
      .eq("assigned_closer_id", data.closer_id)
      .eq("scheduled_at", booking.scheduled_at)
      .neq("id", data.booking_id)
      .neq("status", "cancelled");
    if ((clash ?? []).length > 0) throw new Error("That closer already has a call at this time.");

    const { MANAGER_SLOT_MINUTES } = await import("@/lib/dm-manager-booking.server");
    const { createZoomMeetingOnCloserAccount, formatScheduledLabel, EST_TZ } = await import("@/lib/b2b-booking.server");
    const topic = `${booking.name} - 1-on-1 call`;

    // Prefer the closer's own Zoom, then the manager's, then the company account.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closerCreds } = await (supabaseAdmin.from("closer_zoom_credentials") as any)
      .select("zoom_account_id, zoom_client_id, zoom_client_secret")
      .eq("closer_id", data.closer_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mgrCreds } = await (supabaseAdmin.from("dm_manager_zoom_credentials") as any)
      .select("zoom_account_id, zoom_client_id, zoom_client_secret, zoom_host_email")
      .eq("manager_id", me.id)
      .maybeSingle();

    const attempts: { accountId: string | null; clientId: string | null; clientSecret: string | null; hostEmail: string | null }[] = [
      {
        accountId: (closerCreds?.zoom_account_id as string | null) ?? null,
        clientId: (closerCreds?.zoom_client_id as string | null) ?? null,
        clientSecret: (closerCreds?.zoom_client_secret as string | null) ?? null,
        hostEmail: closer.email,
      },
      {
        accountId: (mgrCreds?.zoom_account_id as string | null) ?? null,
        clientId: (mgrCreds?.zoom_client_id as string | null) ?? null,
        clientSecret: (mgrCreds?.zoom_client_secret as string | null) ?? null,
        hostEmail: (mgrCreds?.zoom_host_email as string | null) ?? null,
      },
      {
        accountId: process.env["ZOOM_ACCOUNT_ID"] ?? null,
        clientId: process.env["ZOOM_CLIENT_ID"] ?? null,
        clientSecret: process.env["ZOOM_CLIENT_SECRET"] ?? null,
        hostEmail: null,
      },
    ];

    let meetingUrl: string | null = null;
    for (const a of attempts) {
      if (!a.accountId || !a.clientId || !a.clientSecret) continue;
      try {
        meetingUrl = await createZoomMeetingOnCloserAccount({
          ...a,
          topic,
          start_time: booking.scheduled_at as string,
          duration: MANAGER_SLOT_MINUTES,
        });
      } catch {
        meetingUrl = null;
      }
      if (meetingUrl) break;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .update({
        assigned_closer_id: data.closer_id,
        ...(meetingUrl ? { meeting_url: meetingUrl } : {}),
      })
      .eq("id", data.booking_id)
      .eq("manager_id", me.id);
    if (error) throw new Error(error.message);

    const finalUrl = meetingUrl ?? ((booking.meeting_url as string | null) ?? null);
    const scheduledLabel = formatScheduledLabel(booking.scheduled_at as string, (booking.timezone as string | null) ?? EST_TZ);
    const closerLabel = formatScheduledLabel(booking.scheduled_at as string, EST_TZ);

    try {
      const { sendTransactional } = await import("@/lib/email/transactional.server");
      // Tell the closer about the call they now own.
      await sendTransactional({
        templateName: "one-on-one-call-manager",
        recipientEmail: closer.email,
        idempotencyKey: `dm-manager-assign-closer-${data.booking_id}-${data.closer_id}`,
        templateData: {
          managerName: closer.full_name,
          name: booking.name,
          email: booking.email,
          phone: (booking.phone as string | null) || null,
          scheduledLabel: closerLabel,
          meetingUrl: finalUrl,
          durationMinutes: MANAGER_SLOT_MINUTES,
          timezone: (booking.timezone as string | null) || null,
        },
      });
      // Re-send the applicant their details when the Zoom link changed.
      if (meetingUrl) {
        await sendTransactional({
          templateName: "one-on-one-call",
          recipientEmail: booking.email as string,
          idempotencyKey: `dm-manager-assign-applicant-${data.booking_id}-${data.closer_id}`,
          templateData: {
            name: booking.name,
            managerName: closer.full_name,
            scheduledLabel,
            meetingUrl: finalUrl,
            durationMinutes: MANAGER_SLOT_MINUTES,
          },
        });
      }
    } catch (e) {
      console.error("[assignCloserToManagerBooking] email failed", e);
    }

    return { ok: true, meeting_url: finalUrl };
  });

export const unassignManagerBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const me = await requireManager(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .update({ assigned_closer_id: null }).eq("id", data.booking_id).eq("manager_id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Closer: 1-on-1 calls their manager assigned to them                        */
/* -------------------------------------------------------------------------- */

export const listMyAssignedManagerCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closer } = await (supabaseAdmin.from("closers") as any)
      .select("id").eq("user_id", context.userId).maybeSingle();
    if (!closer) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .select("id, name, email, phone, scheduled_at, timezone, meeting_url, status, notes")
      .eq("assigned_closer_id", closer.id)
      .order("scheduled_at", { ascending: true });
    return (data ?? []) as Array<{
      id: string; name: string; email: string; phone: string | null;
      scheduled_at: string; timezone: string | null; meeting_url: string | null;
      status: string; notes: string | null;
    }>;
  });

export const updateMyAssignedManagerCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closer } = await (supabaseAdmin.from("closers") as any)
      .select("id").eq("user_id", context.userId).maybeSingle();
    if (!closer) throw new Error("Not a closer");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("dm_manager_bookings") as any)
      .update({ status: data.status }).eq("id", data.id).eq("assigned_closer_id", closer.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
