import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Public: submit application with email + return booking token ----------
const InvestEnum = z.enum(["Yes", "No", "Maybe"]);
const CreditEnum = z.enum(["Below 600", "600-650", "650-700", "700-750", "750-800", "800-850"]);
const ReferrerEnum = z.enum(["Tyler", "Eli", "Bailie", "Lucas"]);

const SubmitSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(200).optional().nullable(),
  why_remote_sales: z.string().trim().max(2000).optional().nullable(),
  current_monthly_income: z.string().trim().min(1).max(60),
  desired_monthly_income: z.string().trim().min(1).max(60),
  open_to_invest: InvestEnum.optional().nullable(),
  credit_score_range: CreditEnum,
  referred_by: ReferrerEnum.optional().nullable(),
});

export const submitB2cApplication = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("applications")
      .insert(data)
      .select("id, booking_token")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, token: row.booking_token as string };
  });

// ---------- Zoom helpers (per-closer credentials) ----------
async function getZoomToken(creds: {
  accountId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string | null> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${creds.accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

async function createZoomMeetingForUser(input: {
  accountId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  topic: string;
  start_time: string;
  duration: number;
}): Promise<{ join_url: string | null; meeting_id: string | null }> {
  try {
    if (!input.accountId || !input.clientId || !input.clientSecret) {
      return { join_url: null, meeting_id: null };
    }
    const token = await getZoomToken({
      accountId: input.accountId,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    });
    if (!token) return { join_url: null, meeting_id: null };
    const res = await fetch(
      `https://api.zoom.us/v2/users/me/meetings`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: input.topic,
          type: 2,
          start_time: input.start_time,
          duration: input.duration,
          settings: { join_before_host: true, waiting_room: false },
        }),
      },
    );
    if (!res.ok) return { join_url: null, meeting_id: null };
    const j = (await res.json()) as { join_url?: string; id?: number };
    return { join_url: j.join_url ?? null, meeting_id: j.id ? String(j.id) : null };
  } catch {
    return { join_url: null, meeting_id: null };
  }
}

// ---------- Google Calendar (shared company calendar via connector gateway) ----------
const GCAL_GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

async function gcalCreateEvent(input: {
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  attendees: string[];
}): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !connKey) return null;
  try {
    const res = await fetch(
      `${GCAL_GATEWAY}/calendars/primary/events?sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: input.summary,
          description: input.description,
          start: { dateTime: input.startISO },
          end: { dateTime: input.endISO },
          attendees: input.attendees.filter(Boolean).map((email) => ({ email })),
          reminders: { useDefault: true },
        }),
      },
    );
    if (!res.ok) {
      console.error("gcal create failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json()) as { id?: string };
    return j.id ?? null;
  } catch (e) {
    console.error("gcal create error", e);
    return null;
  }
}

async function gcalDeleteEvent(eventId: string): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !connKey || !eventId) return;
  try {
    await fetch(
      `${GCAL_GATEWAY}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connKey,
        },
      },
    );
  } catch (e) {
    console.error("gcal delete error", e);
  }
}

// ---------- Public: list available closer slots for a date ----------
const EST_TZ = "America/New_York";
const DEFAULT_SLOT_MINUTES = 30;

async function getB2cSettingsRow(): Promise<{ slot_minutes: number; days_out: number }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as never as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: number) => { maybeSingle: () => Promise<{ data: { slot_minutes: number; days_out: number } | null }> } } } })
      .from("b2c_settings").select("slot_minutes, days_out").eq("id", 1).maybeSingle();
    return { slot_minutes: data?.slot_minutes ?? DEFAULT_SLOT_MINUTES, days_out: data?.days_out ?? 14 };
  } catch {
    return { slot_minutes: DEFAULT_SLOT_MINUTES, days_out: 14 };
  }
}

async function listB2cAvailRules(): Promise<Array<{ day_of_week: number; start_minute: number; end_minute: number }>> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as never as { from: (t: string) => { select: (c: string) => Promise<{ data: Array<{ day_of_week: number; start_minute: number; end_minute: number }> | null }> } })
      .from("b2c_availability_rules").select("day_of_week, start_minute, end_minute");
    return data ?? [];
  } catch {
    return [];
  }
}

function zonedDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function zonedDayOfWeek(d: Date, tz: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(name);
}
function zonedWallToUTC(y: number, m: number, d: number, hh: number, mm: number, tz: string) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = fmt.formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = asUTC - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export const listCloserSlotsForDate = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data }) => {
    const viewerTz = data.tz || EST_TZ;
    const [vy, vm, vd] = data.date.split("-").map(Number);
    const viewerDayStart = zonedWallToUTC(vy, vm, vd, 0, 0, viewerTz);
    const viewerDayEnd = zonedWallToUTC(vy, vm, vd + 1, 0, 0, viewerTz);

    const { slot_minutes: SLOT, days_out } = await getB2cSettingsRow();
    // Enforce booking horizon
    const horizonMs = Date.now() + days_out * 24 * 60 * 60 * 1000;
    if (viewerDayStart.getTime() > horizonMs) return [] as Array<{ iso: string; capacity: number }>;

    const adminRules = await listB2cAvailRules();
    if (adminRules.length === 0) return [] as Array<{ iso: string; capacity: number }>;

    // group admin windows by EST day-of-week
    const adminByDow = new Map<number, Array<{ s: number; e: number }>>();
    for (const r of adminRules) {
      const arr = adminByDow.get(r.day_of_week) ?? [];
      arr.push({ s: r.start_minute, e: r.end_minute });
      adminByDow.set(r.day_of_week, arr);
    }

    const estDates = new Set<string>();
    estDates.add(zonedDateKey(viewerDayStart, EST_TZ));
    estDates.add(zonedDateKey(new Date(viewerDayEnd.getTime() - 1), EST_TZ));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Existing bookings overlapping this viewer day window — block one lead per slot.
    const { data: existing } = await supabaseAdmin
      .from("closer_bookings")
      .select("slot_start")
      .gte("slot_start", new Date(viewerDayStart.getTime() - SLOT * 60_000).toISOString())
      .lt("slot_start", new Date(viewerDayEnd.getTime() + SLOT * 60_000).toISOString())
      .in("status", ["pending_assignment", "assigned"]);

    const taken = new Set<string>();
    for (const b of existing ?? []) {
      taken.add(new Date(b.slot_start as string).toISOString());
    }

    const now = Date.now();
    const slotMap = new Map<string, number>();

    for (const estKey of estDates) {
      const [ey, em, ed] = estKey.split("-").map(Number);
      const probe = zonedWallToUTC(ey, em, ed, 12, 0, EST_TZ);
      const dow = zonedDayOfWeek(probe, EST_TZ);
      const adminWindows = adminByDow.get(dow) ?? [];
      if (adminWindows.length === 0) continue;

      for (const w of adminWindows) {
        for (let mm = w.s; mm + SLOT <= w.e; mm += SLOT) {
          const slot = zonedWallToUTC(ey, em, ed, Math.floor(mm / 60), mm % 60, EST_TZ);
          const t = slot.getTime();
          if (t < now) continue;
          if (t > horizonMs) continue;
          if (t < viewerDayStart.getTime() || t >= viewerDayEnd.getTime()) continue;
          const iso = slot.toISOString();
          if (taken.has(iso)) continue;
          slotMap.set(iso, 1);
        }
      }
    }

    return Array.from(slotMap.entries())
      .sort(([a],[b]) => (a < b ? -1 : 1))
      .map(([iso, capacity]) => ({ iso, capacity }));
  });

// Public: booking window + open weekdays for the apply page calendar
export const getPublicBookingWindow = createServerFn({ method: "GET" })
  .handler(async () => {
    const { days_out } = await getB2cSettingsRow();
    const adminRules = await listB2cAvailRules();
    const weekdays = Array.from(new Set(adminRules.map((r) => r.day_of_week))).sort();
    return {
      days_out,
      // null => no admin rules configured, treat all weekdays as potentially open
      open_weekdays: adminRules.length > 0 ? weekdays : null,
    } as { days_out: number; open_weekdays: number[] | null };
  });



// ---------- Public: create a closer booking from an application ----------
export const createCloserBooking = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    application_id: z.string().uuid(),
    token: z.string().uuid(),
    slot_start: z.string().datetime(),
  }).parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error: aerr } = await supabaseAdmin
      .from("applications")
      .select("id, booking_token, full_name, phone, email")
      .eq("id", data.application_id)
      .maybeSingle();
    if (aerr) throw new Error(aerr.message);
    if (!app) throw new Error("Application not found");
    if ((app.booking_token as unknown as string) !== data.token) throw new Error("Invalid token");
    if (!app.email) throw new Error("Application missing email");

    // ensure not already booked
    const { data: existing } = await supabaseAdmin
      .from("closer_bookings").select("id").eq("application_id", data.application_id).limit(1);
    if ((existing ?? []).length > 0) throw new Error("You've already booked a call.");

    const { slot_minutes: SLOT } = await getB2cSettingsRow();
    const start = new Date(data.slot_start);
    const end = new Date(start.getTime() + SLOT * 60_000);

    // capacity check
    const { data: activeClosers } = await supabaseAdmin
      .from("closers").select("id").eq("active", true);
    const totalActive = (activeClosers ?? []).length;
    const { data: same } = await supabaseAdmin
      .from("closer_bookings").select("id").eq("slot_start", start.toISOString())
      .in("status", ["pending_assignment", "assigned"]);
    if ((same ?? []).length >= totalActive) {
      throw new Error("That time slot just filled up. Please pick another.");
    }

    const { data: booking, error } = await supabaseAdmin
      .from("closer_bookings")
      .insert({
        application_id: data.application_id,
        slot_start: start.toISOString(),
        slot_end: end.toISOString(),
        status: "pending_assignment",
        applicant_name: app.full_name,
        applicant_email: app.email,
        applicant_phone: app.phone,
      })
      .select("id, slot_start")
      .single();
    if (error) throw new Error(error.message);
    return { id: booking.id };
  });

// ---------- Admin: closers CRUD ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listClosers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("closers").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const DEFAULT_CLOSER_PASSWORD = "ConversionLab1095!";

export const createCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const { data: row, error } = await supabaseAdmin.from("closers").insert({
      full_name: data.full_name,
      email,
    }).select("id").single();
    if (error) throw new Error(error.message);

    // Create the auth user immediately with default password (handle_new_user trigger
    // links them to the closers row by email and grants the 'closer' role).
    const { data: created, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: DEFAULT_CLOSER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (userErr) throw new Error(userErr.message);
    const newUserId = created.user?.id;
    if (newUserId) {
      // Force first-login password change
      await supabaseAdmin.from("profiles")
        .update({ must_change_password: true, full_name: data.full_name })
        .eq("user_id", newUserId);
    }

    await sendCloserInviteEmail({
      closerId: row.id,
      email,
      fullName: data.full_name,
      password: DEFAULT_CLOSER_PASSWORD,
    });

    return { id: row.id, default_password: DEFAULT_CLOSER_PASSWORD };
  });

async function sendCloserInviteEmail(input: {
  closerId: string;
  email: string;
  fullName: string;
  password: string;
}) {
  try {
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    await sendTransactional({
      templateName: "closer-invite",
      recipientEmail: input.email,
      idempotencyKey: `closer-invite-${input.closerId}-${Date.now()}`,
      templateData: {
        closerName: input.fullName,
        email: input.email,
        password: input.password,
        loginUrl: "https://conversionlab.space/app/auth",
      },
    });
  } catch (e) {
    console.error("sendCloserInviteEmail failed", e);
  }
}

export const resendCloserInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: closer, error } = await supabaseAdmin
      .from("closers").select("id, email, full_name").eq("id", data.id).single();
    if (error || !closer) throw new Error(error?.message || "Closer not found");

    // Reset their password to the default so the emailed credentials work.
    const { data: userRow } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = userRow?.users?.find((u) => (u.email || "").toLowerCase() === closer.email.toLowerCase());
    if (authUser) {
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: DEFAULT_CLOSER_PASSWORD });
      await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("user_id", authUser.id);
    } else {
      // No auth user yet — create one
      await supabaseAdmin.auth.admin.createUser({
        email: closer.email,
        password: DEFAULT_CLOSER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: closer.full_name },
      });
    }

    await sendCloserInviteEmail({
      closerId: closer.id,
      email: closer.email,
      fullName: closer.full_name,
      password: DEFAULT_CLOSER_PASSWORD,
    });
    return { ok: true };
  });

export const updateCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    full_name: z.string().trim().min(1).max(200).optional(),
    active: z.boolean().optional(),
    b2b_active: z.boolean().optional(),
    zoom_account_id: z.string().trim().max(200).nullable().optional(),
    zoom_client_id: z.string().trim().max(200).nullable().optional(),
    zoom_client_secret: z.string().trim().max(500).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, zoom_account_id, zoom_client_id, zoom_client_secret, ...rest } = data;
    const closerPatch: { full_name?: string; active?: boolean; b2b_active?: boolean } = {};
    if (rest.full_name !== undefined) closerPatch.full_name = rest.full_name;
    if (rest.active !== undefined) closerPatch.active = rest.active;
    if (rest.b2b_active !== undefined) closerPatch.b2b_active = rest.b2b_active;
    if (Object.keys(closerPatch).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (context.supabase.from("closers") as any).update(closerPatch).eq("id", id);
      if (error) throw new Error(error.message);
    }
    const hasZoomField =
      zoom_account_id !== undefined || zoom_client_id !== undefined || zoom_client_secret !== undefined;
    if (hasZoomField) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const allCleared =
        zoom_account_id === null && zoom_client_id === null && zoom_client_secret === null;
      if (allCleared) {
        await supabaseAdmin.from("closer_zoom_credentials").delete().eq("closer_id", id);
      } else {
        const upsert: {
          closer_id: string;
          zoom_account_id?: string | null;
          zoom_client_id?: string | null;
          zoom_client_secret?: string | null;
          updated_at: string;
        } = { closer_id: id, updated_at: new Date().toISOString() };
        if (zoom_account_id !== undefined) upsert.zoom_account_id = zoom_account_id;
        if (zoom_client_id !== undefined) upsert.zoom_client_id = zoom_client_id;
        if (zoom_client_secret !== undefined) upsert.zoom_client_secret = zoom_client_secret;
        const { error } = await supabaseAdmin
          .from("closer_zoom_credentials")
          .upsert(upsert, { onConflict: "closer_id" });
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });


export const getCloserZoomCreds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("closer_zoom_credentials")
      .select("zoom_account_id, zoom_client_id, zoom_client_secret")
      .eq("closer_id", data.closer_id)
      .maybeSingle();
    return {
      zoom_account_id: (row?.zoom_account_id as string | null) ?? null,
      zoom_client_id: (row?.zoom_client_id as string | null) ?? null,
      zoom_client_secret: (row?.zoom_client_secret as string | null) ?? null,
    };
  });

export const listClosersZoomStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("closer_zoom_credentials")
      .select("closer_id, zoom_account_id, zoom_client_id, zoom_client_secret");
    const map: Record<string, boolean> = {};
    for (const r of data ?? []) {
      map[r.closer_id as string] = !!(r.zoom_account_id && r.zoom_client_id && r.zoom_client_secret);
    }
    return map;
  });

export const deleteCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("closers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Closer availability ----------
const CloserAvailRule = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int().min(1).max(1440),
});

const TrackEnum = z.enum(["b2c", "b2b"]).default("b2c");

export const listCloserAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    closer_id: z.string().uuid(),
    track: TrackEnum.optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const track = data.track ?? "b2c";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase
      .from("closer_availability_rules") as any)
      .select("id, day_of_week, start_minute, end_minute, track")
      .eq("closer_id", data.closer_id)
      .eq("track", track)
      .order("day_of_week");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const replaceCloserAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    closer_id: z.string().uuid(),
    rules: z.array(CloserAvailRule).max(100),
    track: TrackEnum.optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const track = data.track ?? "b2c";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Permission: admin OR own row
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: c } = await context.supabase
        .from("closers").select("id").eq("id", data.closer_id).eq("user_id", context.userId).maybeSingle();
      if (!c) throw new Error("Forbidden");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const del = await (supabaseAdmin.from("closer_availability_rules") as any)
      .delete().eq("closer_id", data.closer_id).eq("track", track);
    if (del.error) throw new Error(del.error.message);
    if (data.rules.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ins = await (supabaseAdmin.from("closer_availability_rules") as any).insert(
        data.rules.map((r) => ({ ...r, closer_id: data.closer_id, track })),
      );
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true };
  });


// ---------- Bookings ----------
export const listCloserBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data, error } = await context.supabase
      .from("closer_bookings")
      .select("*, closers:assigned_closer_id (full_name, email)")
      .order("slot_start", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [], isAdmin: !!isAdmin };
  });

function formatScheduledLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function sendCloserBookingEmails(input: {
  bookingId: string;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  closerName: string;
  closerEmail: string | null;
  scheduledAt: string;
  meetingUrl: string | null;
  durationMinutes: number;
}) {
  try {
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    const scheduledLabel = formatScheduledLabel(input.scheduledAt);

    const tasks: Array<Promise<unknown>> = [];

    if (input.applicantEmail) {
      tasks.push(sendTransactional({
        templateName: "closer-call-prospect",
        recipientEmail: input.applicantEmail,
        idempotencyKey: `closer-booking-prospect-${input.bookingId}`,
        templateData: {
          name: input.applicantName,
          scheduledAt: input.scheduledAt,
          scheduledLabel,
          meetingUrl: input.meetingUrl,
          durationMinutes: input.durationMinutes,
          closerName: input.closerName,
        },
      }));
    }

    if (input.closerEmail) {
      tasks.push(sendTransactional({
        templateName: "closer-call-closer",
        recipientEmail: input.closerEmail,
        idempotencyKey: `closer-booking-closer-${input.bookingId}`,
        templateData: {
          closerName: input.closerName,
          applicantName: input.applicantName,
          applicantEmail: input.applicantEmail,
          applicantPhone: input.applicantPhone,
          scheduledAt: input.scheduledAt,
          scheduledLabel,
          meetingUrl: input.meetingUrl,
          durationMinutes: input.durationMinutes,
        },
      }));
    }

    await Promise.allSettled(tasks);
  } catch (e) {
    console.error("sendCloserBookingEmails failed", e);
  }
}


export const assignCloserToBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    booking_id: z.string().uuid(),
    closer_id: z.string().uuid(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: berr } = await supabaseAdmin
      .from("closer_bookings").select("*").eq("id", data.booking_id).single();
    if (berr || !booking) throw new Error(berr?.message || "Booking not found");
    const { data: closer, error: cerr } = await supabaseAdmin
      .from("closers").select("*").eq("id", data.closer_id).single();
    if (cerr || !closer) throw new Error(cerr?.message || "Closer not found");

    // double-book guard
    const { data: conflict } = await supabaseAdmin
      .from("closer_bookings").select("id")
      .eq("slot_start", booking.slot_start as string)
      .eq("assigned_closer_id", data.closer_id)
      .neq("id", data.booking_id);
    if ((conflict ?? []).length > 0) throw new Error("That closer is already booked at this time.");

    const { slot_minutes: SLOT } = await getB2cSettingsRow();
    const { data: zoomCreds } = await supabaseAdmin
      .from("closer_zoom_credentials")
      .select("zoom_account_id, zoom_client_id, zoom_client_secret")
      .eq("closer_id", data.closer_id)
      .maybeSingle();
    const zoom = await createZoomMeetingForUser({
      accountId: (zoomCreds?.zoom_account_id as string | null) ?? null,
      clientId: (zoomCreds?.zoom_client_id as string | null) ?? null,
      clientSecret: (zoomCreds?.zoom_client_secret as string | null) ?? null,
      topic: `${booking.applicant_name} — Interview`,
      start_time: booking.slot_start as string,
      duration: SLOT,
    });

    // Create Google Calendar event titled "<Closer name> with <Lead name>"
    const eventTitle = `${closer.full_name} with ${booking.applicant_name}`;
    const descLines = [
      `Applicant: ${booking.applicant_name}`,
      booking.applicant_email ? `Email: ${booking.applicant_email}` : "",
      booking.applicant_phone ? `Phone: ${booking.applicant_phone}` : "",
      zoom.join_url ? `\nZoom: ${zoom.join_url}` : "",
    ].filter(Boolean).join("\n");
    const attendees = [closer.email as string];
    if (booking.applicant_email) attendees.push(booking.applicant_email as string);
    const calEventId = await gcalCreateEvent({
      summary: eventTitle,
      description: descLines,
      startISO: booking.slot_start as string,
      endISO: booking.slot_end as string,
      attendees,
    });

    const { error: uerr } = await supabaseAdmin.from("closer_bookings").update({
      assigned_closer_id: data.closer_id,
      status: "assigned",
      zoom_join_url: zoom.join_url,
      zoom_meeting_id: zoom.meeting_id,
      google_calendar_event_id: calEventId,
    }).eq("id", data.booking_id);
    if (uerr) throw new Error(uerr.message);

    await sendCloserBookingEmails({
      bookingId: data.booking_id,
      applicantName: booking.applicant_name as string,
      applicantEmail: (booking.applicant_email as string | null) ?? null,
      applicantPhone: (booking.applicant_phone as string | null) ?? null,
      closerName: closer.full_name as string,
      closerEmail: (closer.email as string | null) ?? null,
      scheduledAt: booking.slot_start as string,
      meetingUrl: zoom.join_url,
      durationMinutes: SLOT,
    });


    return { ok: true, zoom_join_url: zoom.join_url };
  });

export const unassignCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: existing } = await context.supabase
      .from("closer_bookings").select("google_calendar_event_id").eq("id", data.booking_id).maybeSingle();
    if (existing?.google_calendar_event_id) {
      await gcalDeleteEvent(existing.google_calendar_event_id as string);
    }
    const { error } = await context.supabase.from("closer_bookings").update({
      assigned_closer_id: null,
      status: "pending_assignment",
      zoom_join_url: null,
      zoom_meeting_id: null,
      google_calendar_event_id: null,
    }).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelCloserBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: existing } = await context.supabase
      .from("closer_bookings").select("google_calendar_event_id").eq("id", data.booking_id).maybeSingle();
    if (existing?.google_calendar_event_id) {
      await gcalDeleteEvent(existing.google_calendar_event_id as string);
    }
    const { error } = await context.supabase.from("closer_bookings")
      .update({ status: "cancelled", google_calendar_event_id: null }).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCloserBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: existing } = await context.supabase
      .from("closer_bookings").select("google_calendar_event_id").eq("id", data.booking_id).maybeSingle();
    if (existing?.google_calendar_event_id) {
      try { await gcalDeleteEvent(existing.google_calendar_event_id as string); } catch { /* ignore */ }
    }
    const { error } = await context.supabase.from("closer_bookings").delete().eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: reschedule a booking to a new slot ----------
export const rescheduleCloserBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    booking_id: z.string().uuid(),
    slot_start: z.string().datetime(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: berr } = await supabaseAdmin
      .from("closer_bookings").select("*").eq("id", data.booking_id).single();
    if (berr || !booking) throw new Error(berr?.message || "Booking not found");

    const { slot_minutes: SLOT } = await getB2cSettingsRow();
    const start = new Date(data.slot_start);
    const end = new Date(start.getTime() + SLOT * 60_000);

    // Capacity check — same logic as createCloserBooking
    const { data: activeClosers } = await supabaseAdmin
      .from("closers").select("id").eq("active", true);
    const totalActive = (activeClosers ?? []).length;
    const { data: same } = await supabaseAdmin
      .from("closer_bookings").select("id, assigned_closer_id")
      .eq("slot_start", start.toISOString())
      .in("status", ["pending_assignment", "assigned"]);
    const others = (same ?? []).filter((r) => r.id !== data.booking_id);
    if (totalActive > 0 && others.length >= totalActive) {
      throw new Error("That time slot is full. Pick another.");
    }
    // Same-closer conflict if assigned
    if (booking.assigned_closer_id) {
      const closerConflict = others.find((r) => r.assigned_closer_id === booking.assigned_closer_id);
      if (closerConflict) throw new Error("That closer is already booked at this time.");
    }

    // Delete the old calendar event (we'll recreate if assigned)
    if (booking.google_calendar_event_id) {
      try { await gcalDeleteEvent(booking.google_calendar_event_id as string); } catch { /* ignore */ }
    }

    let newZoomUrl: string | null = (booking.zoom_join_url as string | null) ?? null;
    let newZoomId: string | null = (booking.zoom_meeting_id as string | null) ?? null;
    let newCalId: string | null = null;

    if (booking.assigned_closer_id) {
      // Recreate Zoom meeting at new time
      const { data: closer } = await supabaseAdmin
        .from("closers").select("*").eq("id", booking.assigned_closer_id as string).single();
      const { data: zoomCreds } = await supabaseAdmin
        .from("closer_zoom_credentials")
        .select("zoom_account_id, zoom_client_id, zoom_client_secret")
        .eq("closer_id", booking.assigned_closer_id as string)
        .maybeSingle();
      const zoom = await createZoomMeetingForUser({
        accountId: (zoomCreds?.zoom_account_id as string | null) ?? null,
        clientId: (zoomCreds?.zoom_client_id as string | null) ?? null,
        clientSecret: (zoomCreds?.zoom_client_secret as string | null) ?? null,
        topic: `${booking.applicant_name} — Interview`,
        start_time: start.toISOString(),
        duration: SLOT,
      });
      newZoomUrl = zoom.join_url;
      newZoomId = zoom.meeting_id;

      if (closer) {
        const eventTitle = `${closer.full_name} with ${booking.applicant_name}`;
        const descLines = [
          `Applicant: ${booking.applicant_name}`,
          booking.applicant_email ? `Email: ${booking.applicant_email}` : "",
          booking.applicant_phone ? `Phone: ${booking.applicant_phone}` : "",
          zoom.join_url ? `\nZoom: ${zoom.join_url}` : "",
        ].filter(Boolean).join("\n");
        const attendees = [closer.email as string];
        if (booking.applicant_email) attendees.push(booking.applicant_email as string);
        newCalId = await gcalCreateEvent({
          summary: eventTitle,
          description: descLines,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          attendees,
        });

        // Notify both parties of the new time
        await sendCloserBookingEmails({
          bookingId: data.booking_id + "-rescheduled-" + start.getTime(),
          applicantName: booking.applicant_name as string,
          applicantEmail: (booking.applicant_email as string | null) ?? null,
          applicantPhone: (booking.applicant_phone as string | null) ?? null,
          closerName: closer.full_name as string,
          closerEmail: (closer.email as string | null) ?? null,
          scheduledAt: start.toISOString(),
          meetingUrl: zoom.join_url,
          durationMinutes: SLOT,
        });
      }
    }

    const { error: uerr } = await supabaseAdmin.from("closer_bookings").update({
      slot_start: start.toISOString(),
      slot_end: end.toISOString(),
      zoom_join_url: newZoomUrl,
      zoom_meeting_id: newZoomId,
      google_calendar_event_id: newCalId,
    }).eq("id", data.booking_id);
    if (uerr) throw new Error(uerr.message);

    return { ok: true };
  });





// ---------- Admin: get full application by id ----------
export const getApplicationById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    // Closers can also view applications for bookings assigned to them
    if (!isAdmin) {
      const { data: closer } = await context.supabase
        .from("closers").select("id").eq("user_id", context.userId).maybeSingle();
      if (!closer) throw new Error("Forbidden");
      const { data: booking } = await context.supabase
        .from("closer_bookings").select("id")
        .eq("application_id", data.id).eq("assigned_closer_id", closer.id).limit(1);
      if (!booking || booking.length === 0) throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error } = await supabaseAdmin
      .from("applications").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("Application not found");
    return app;
  });

// ---------- Closer: submit call outcome ----------
const OutcomeEnum = z.enum(["not_interested", "disqualified", "closed", "deposit", "no_show"]);
const CommissionPctEnum = z.number().min(0).max(100);

function computeCommission(outcome: string, deal: number | null, deposit: number | null, followUp: number | null, pct: number | null) {
  if (!pct) return null;
  let base = 0;
  if (outcome === "closed") base = deal ?? 0;
  else if (outcome === "deposit") base = (deposit ?? 0) + (followUp ?? 0);
  else return null;
  if (base <= 0) return null;
  return Math.round(base * (pct / 100) * 100) / 100;
}

export const recordBookingOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    booking_id: z.string().uuid(),
    outcome: OutcomeEnum,
    deal_amount: z.number().nonnegative().nullable().optional(),
    deposit_amount: z.number().nonnegative().nullable().optional(),
    follow_up_amount: z.number().nonnegative().nullable().optional(),
    follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    commission_percent: CommissionPctEnum.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: booking, error: berr } = await context.supabase
      .from("closer_bookings").select("id, assigned_closer_id").eq("id", data.booking_id).maybeSingle();
    if (berr) throw new Error(berr.message);
    if (!booking) throw new Error("Booking not found");

    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: closer } = await context.supabase
        .from("closers").select("id").eq("user_id", context.userId).maybeSingle();
      if (!closer || closer.id !== booking.assigned_closer_id) throw new Error("Forbidden");
    }

    const deal = data.outcome === "closed" ? data.deal_amount ?? null : null;
    const deposit = data.outcome === "deposit" ? data.deposit_amount ?? null : null;
    const followUp = data.outcome === "deposit" ? data.follow_up_amount ?? null : null;
    const pct = (data.outcome === "closed" || data.outcome === "deposit") ? data.commission_percent ?? null : null;
    const commissionAmount = computeCommission(data.outcome, deal, deposit, followUp, pct);

    const patch = {
      outcome: data.outcome,
      outcome_at: new Date().toISOString(),
      outcome_notes: data.notes ?? null,
      deal_amount: deal,
      deposit_amount: deposit,
      follow_up_amount: followUp,
      follow_up_date: data.outcome === "deposit" ? data.follow_up_date ?? null : null,
      commission_percent: pct,
      commission_amount: commissionAmount,
      status: "completed",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_bookings") as any).update(patch).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: list closed/deposit deals for commission assignment ----------
export const listClosedDealsForCommission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("closer_bookings")
      .select("id, applicant_name, applicant_email, slot_start, outcome, outcome_at, deal_amount, deposit_amount, follow_up_amount, commission_percent, commission_amount, commission_status, commission_paid_at, commission_payout_note, closers:assigned_closer_id (id, full_name, email)")
      .in("outcome", ["closed", "deposit"])
      .order("outcome_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Admin: approve a closer's commission ----------
export const approveBookingCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_bookings") as any)
      .update({ commission_status: "approved" })
      .eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: edit commission on a booking ----------
export const updateBookingCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    booking_id: z.string().uuid(),
    deal_amount: z.number().nonnegative().nullable().optional(),
    deposit_amount: z.number().nonnegative().nullable().optional(),
    follow_up_amount: z.number().nonnegative().nullable().optional(),
    commission_percent: z.number().min(0).max(100).nullable().optional(),
    commission_amount: z.number().nonnegative().nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: gerr } = await context.supabase
      .from("closer_bookings")
      .select("outcome, deal_amount, deposit_amount, follow_up_amount, commission_percent")
      .eq("id", data.booking_id).maybeSingle();
    if (gerr) throw new Error(gerr.message);
    if (!row) throw new Error("Booking not found");

    const outcome = row.outcome as string;
    const deal = data.deal_amount !== undefined ? data.deal_amount : (row.deal_amount as number | null);
    const deposit = data.deposit_amount !== undefined ? data.deposit_amount : (row.deposit_amount as number | null);
    const followUp = data.follow_up_amount !== undefined ? data.follow_up_amount : (row.follow_up_amount as number | null);
    const pct = data.commission_percent !== undefined ? data.commission_percent : (row.commission_percent as number | null);

    // If admin passed an explicit commission_amount, honor it. Otherwise recompute.
    const commissionAmount = data.commission_amount !== undefined
      ? data.commission_amount
      : computeCommission(outcome, deal, deposit, followUp, pct);

    const patch: Record<string, unknown> = {
      deal_amount: deal,
      deposit_amount: deposit,
      follow_up_amount: followUp,
      commission_percent: pct,
      commission_amount: commissionAmount,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_bookings") as any).update(patch).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true, commission_amount: commissionAmount };
  });

// ---------- Admin: clear a booking's outcome/commission (remove from commissions list) ----------
export const clearBookingOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_bookings") as any).update({
      outcome: null,
      outcome_at: null,
      deal_amount: null,
      deposit_amount: null,
      follow_up_amount: null,
      commission_percent: null,
      commission_amount: null,
      outcome_notes: null,
    }).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- Closer: list my commissions from B2C bookings ----------
export const listMyCloserCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: closer } = await context.supabase
      .from("closers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!closer) return { rows: [], totals: { closed: 0, deposit: 0, commission: 0, approved: 0, pending: 0 } };
    const { data, error } = await context.supabase
      .from("closer_bookings")
      .select("id, applicant_name, slot_start, outcome, outcome_at, deal_amount, deposit_amount, follow_up_amount, commission_percent, commission_amount, commission_status")
      .eq("assigned_closer_id", closer.id)
      .in("outcome", ["closed", "deposit"])
      .order("outcome_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const totals = rows.reduce((acc, r) => {
      const c = Number(r.commission_amount ?? 0);
      const approved = (r.commission_status ?? "pending") === "approved";
      acc.commission += c;
      if (approved) acc.approved += c; else acc.pending += c;
      if (r.outcome === "closed") acc.closed += Number(r.deal_amount ?? 0);
      if (r.outcome === "deposit") acc.deposit += Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0);
      return acc;
    }, { closed: 0, deposit: 0, commission: 0, approved: 0, pending: 0 });
    return { rows, totals };
  });

// ---------- Closer/Admin: close-rate stats for a closer ----------
// Only "not_interested", "closed", and "deposit" count toward close-rate denominator.
// "no_show" and "disqualified" are excluded entirely.
export const getCloserStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid().optional(), days: z.number().int().positive().nullable().optional() }).parse)
  .handler(async ({ data, context }) => {
    let closerId = data.closer_id ?? null;
    if (closerId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (!isAdmin) {
        const { data: mine } = await context.supabase
          .from("closers").select("id").eq("user_id", context.userId).maybeSingle();
        if (!mine || mine.id !== closerId) throw new Error("Forbidden");
      }
    } else {
      const { data: mine } = await context.supabase
        .from("closers").select("id").eq("user_id", context.userId).maybeSingle();
      if (!mine) return { closed: 0, deposit: 0, notInterested: 0, qualifiedCalls: 0, totalOutcomes: 0, noShow: 0, disqualified: 0, closeRate: 0 };
      closerId = mine.id;
    }
    let q = context.supabase
      .from("closer_bookings")
      .select("outcome,outcome_at")
      .eq("assigned_closer_id", closerId)
      .not("outcome", "is", null);
    if (data.days) {
      const cutoff = new Date(Date.now() - data.days * 86400_000).toISOString();
      q = q.gte("outcome_at", cutoff);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const counts = { closed: 0, deposit: 0, notInterested: 0, noShow: 0, disqualified: 0 };
    for (const r of rows ?? []) {
      switch (r.outcome) {
        case "closed": counts.closed++; break;
        case "deposit": counts.deposit++; break;
        case "not_interested": counts.notInterested++; break;
        case "no_show": counts.noShow++; break;
        case "disqualified": counts.disqualified++; break;
      }
    }
    const qualifiedCalls = counts.closed + counts.deposit + counts.notInterested;
    const wins = counts.closed + counts.deposit;
    const closeRate = qualifiedCalls > 0 ? Math.round((wins / qualifiedCalls) * 1000) / 10 : 0;
    return {
      closed: counts.closed,
      deposit: counts.deposit,
      notInterested: counts.notInterested,
      noShow: counts.noShow,
      disqualified: counts.disqualified,
      qualifiedCalls,
      totalOutcomes: (rows ?? []).length,
      closeRate,
    };
  });

// ---------- Admin: full closer detail (info + stats + all bookings/outcomes) ----------
export const getCloserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: closer, error: cerr } = await context.supabase
      .from("closers").select("id, full_name, email, active").eq("id", data.closer_id).single();
    if (cerr || !closer) throw new Error(cerr?.message || "Closer not found");
    const { data: bookings, error: berr } = await context.supabase
      .from("closer_bookings")
      .select("id, applicant_name, applicant_email, slot_start, status, outcome, outcome_at, outcome_notes, deal_amount, deposit_amount, follow_up_amount, commission_amount, commission_percent, commission_status")
      .eq("assigned_closer_id", data.closer_id)
      .order("slot_start", { ascending: false });
    if (berr) throw new Error(berr.message);
    return { closer, bookings: bookings ?? [] };
  });


// ---------- Admin: B2C dashboard stats ----------
export const getB2cAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // Day boundaries anchored to America/New_York (Eastern Time)
    const nowEstKey = zonedDateKey(new Date(), EST_TZ); // YYYY-MM-DD in ET
    const [ey, em, ed] = nowEstKey.split("-").map(Number);
    const todayStart = zonedWallToUTC(ey, em, ed, 0, 0, EST_TZ);
    const todayEnd = zonedWallToUTC(ey, em, ed + 1, 0, 0, EST_TZ);
    const tsISO = todayStart.toISOString();
    const teISO = todayEnd.toISOString();

    const [scheduled, going, booked, closed] = await Promise.all([
      context.supabase.from("closer_bookings").select("id", { count: "exact", head: true })
        .eq("status", "pending_assignment"),
      context.supabase.from("closer_bookings").select("id", { count: "exact", head: true })
        .in("status", ["assigned", "completed"])
        .gte("slot_start", tsISO).lt("slot_start", teISO),
      context.supabase.from("closer_bookings").select("id", { count: "exact", head: true })
        .gte("created_at", tsISO).lt("created_at", teISO),
      context.supabase.from("closer_bookings").select("id", { count: "exact", head: true })
        .in("outcome", ["closed", "deposit"])
        .gte("outcome_at", tsISO).lt("outcome_at", teISO),
    ]);
    return {
      scheduledLeads: scheduled.count ?? 0,
      callsGoingLiveToday: going.count ?? 0,
      callsBookedToday: booked.count ?? 0,
      callsClosedToday: closed.count ?? 0,
    };
  });

// ---------- Admin: list closer payouts ----------
export const listCloserPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("closer_payouts")
      .select("id, closer_id, amount, method, note, paid_at, created_at")
      .order("paid_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Admin: record a payout ----------
export const recordCloserPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    closer_id: z.string().uuid(),
    amount: z.number().positive(),
    method: z.string().trim().min(1).max(60),
    note: z.string().trim().max(500).optional().nullable(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_payouts") as any).insert({
      closer_id: data.closer_id,
      amount: data.amount,
      method: data.method,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: delete a payout ----------
export const deleteCloserPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("closer_payouts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: mark B2C commissions paid on the booking rows themselves ----------
export const recordB2cCommissionPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    booking_ids: z.array(z.string().uuid()).min(1),
    note: z.string().trim().max(500).optional().nullable(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_bookings") as any)
      .update({ commission_paid_at: new Date().toISOString(), commission_payout_note: data.note ?? null })
      .in("id", data.booking_ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const undoB2cCommissionPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_ids: z.array(z.string().uuid()).min(1) }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_bookings") as any)
      .update({ commission_paid_at: null, commission_payout_note: null })
      .in("id", data.booking_ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: B2C booking calendar settings & availability ----------
export const getB2cSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return await getB2cSettingsRow();
  });

export const updateB2cSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    slot_minutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]),
    days_out: z.number().int().min(1).max(180),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as never as { from: (t: string) => { upsert: (r: unknown, o: { onConflict: string }) => Promise<{ error: { message: string } | null }> } })
      .from("b2c_settings").upsert({ id: 1, slot_minutes: data.slot_minutes, days_out: data.days_out, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const B2cRule = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int().min(1).max(1440),
});

export const listB2cAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return await listB2cAvailRules();
  });

export const replaceB2cAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ rules: z.array(B2cRule).max(100) }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = (supabaseAdmin as never as { from: (t: string) => { delete: () => { neq: (c: string, v: string) => Promise<{ error: { message: string } | null }> }; insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }> } }).from("b2c_availability_rules");
    const del = await table.delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (del.error) throw new Error(del.error.message);
    if (data.rules.length > 0) {
      const ins = await table.insert(data.rules);
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true };
  });

// List all bookings on a specific date (admin's local date), grouped by status
export const listBookingsForDate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const tz = data.tz || EST_TZ;
    const [y, m, d] = data.date.split("-").map(Number);
    const start = zonedWallToUTC(y, m, d, 0, 0, tz);
    const end = zonedWallToUTC(y, m, d + 1, 0, 0, tz);
    const { data: rows, error } = await context.supabase
      .from("closer_bookings")
      .select("*, closers:assigned_closer_id (full_name, email)")
      .gte("slot_start", start.toISOString())
      .lt("slot_start", end.toISOString())
      .order("slot_start", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Closer: manually submit a commission for admin approval ----------
export const submitManualCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    lead_name: z.string().trim().min(1).max(200),
    deal_amount: z.number().nonnegative(),
    commission_percent: z.number().min(0).max(100),
    commission_amount: z.number().nonnegative(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: closer } = await context.supabase
      .from("closers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!closer) throw new Error("Not a closer");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("closer_bookings") as any).insert({
      assigned_closer_id: closer.id,
      applicant_name: data.lead_name,
      applicant_email: `manual+${closer.id}-${now.getTime()}@conversionlab.space`,
      slot_start: now.toISOString(),
      slot_end: now.toISOString(),
      status: "completed",
      outcome: "closed",
      outcome_at: now.toISOString(),
      outcome_notes: "Manually submitted by closer",
      deal_amount: data.deal_amount,
      commission_percent: data.commission_percent,
      commission_amount: data.commission_amount,
      commission_status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
