import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Public: submit application with email + return booking token ----------
const InvestEnum = z.enum(["Yes", "No", "Maybe"]);
const CreditEnum = z.enum(["600-650", "650-700", "700-750", "750-800", "800-850"]);

const SubmitSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(200),
  why_remote_sales: z.string().trim().min(1).max(2000),
  current_monthly_income: z.string().trim().min(1).max(60),
  desired_monthly_income: z.string().trim().min(1).max(60),
  open_to_invest: InvestEnum,
  credit_score_range: CreditEnum,
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

// ---------- Zoom helpers (per-user account) ----------
async function getZoomToken(): Promise<string | null> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return null;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

async function createZoomMeetingForUser(input: {
  zoomUserEmail: string;
  topic: string;
  start_time: string;
  duration: number;
}): Promise<{ join_url: string | null; meeting_id: string | null }> {
  try {
    const token = await getZoomToken();
    if (!token) return { join_url: null, meeting_id: null };
    const res = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(input.zoomUserEmail)}/meetings`,
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

// ---------- Public: list available closer slots for a date ----------
const EST_TZ = "America/New_York";
const SLOT_MINUTES = 30;

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

    const estDates = new Set<string>();
    estDates.add(zonedDateKey(viewerDayStart, EST_TZ));
    estDates.add(zonedDateKey(new Date(viewerDayEnd.getTime() - 1), EST_TZ));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: activeClosers } = await supabaseAdmin
      .from("closers").select("id").eq("active", true);
    const closerIds = (activeClosers ?? []).map((c) => c.id);
    if (closerIds.length === 0) return [] as Array<{ iso: string; capacity: number }>;

    const { data: rules } = await supabaseAdmin
      .from("closer_availability_rules")
      .select("closer_id, day_of_week, start_minute, end_minute")
      .in("closer_id", closerIds);

    const { data: existing } = await supabaseAdmin
      .from("closer_bookings")
      .select("slot_start, assigned_closer_id")
      .gte("slot_start", new Date(viewerDayStart.getTime() - SLOT_MINUTES * 60_000).toISOString())
      .lt("slot_start", new Date(viewerDayEnd.getTime() + SLOT_MINUTES * 60_000).toISOString())
      .in("status", ["pending_assignment", "assigned"]);

    const now = Date.now();
    // map of iso -> Set of closer_ids that are busy at that slot
    const pendingPerSlot = new Map<string, number>();
    const assignedBusy = new Map<string, Set<string>>();
    for (const b of existing ?? []) {
      const iso = new Date(b.slot_start as string).toISOString();
      if (b.assigned_closer_id) {
        const set = assignedBusy.get(iso) ?? new Set<string>();
        set.add(b.assigned_closer_id as string);
        assignedBusy.set(iso, set);
      } else {
        pendingPerSlot.set(iso, (pendingPerSlot.get(iso) ?? 0) + 1);
      }
    }

    const slotMap = new Map<string, number>();

    for (const estKey of estDates) {
      const [ey, em, ed] = estKey.split("-").map(Number);
      const probe = zonedWallToUTC(ey, em, ed, 12, 0, EST_TZ);
      const dow = zonedDayOfWeek(probe, EST_TZ);
      const todaysRules = (rules ?? []).filter((r) => r.day_of_week === dow);
      // group rule windows by closer
      const byCloser = new Map<string, Array<{ s: number; e: number }>>();
      for (const r of todaysRules) {
        const arr = byCloser.get(r.closer_id as string) ?? [];
        arr.push({ s: r.start_minute as number, e: r.end_minute as number });
        byCloser.set(r.closer_id as string, arr);
      }
      // build set of all candidate slot start minutes across all closers
      const candidateMinutes = new Set<number>();
      for (const windows of byCloser.values()) {
        for (const w of windows) {
          for (let mm = w.s; mm + SLOT_MINUTES <= w.e; mm += SLOT_MINUTES) {
            candidateMinutes.add(mm);
          }
        }
      }
      for (const mm of candidateMinutes) {
        const slot = zonedWallToUTC(ey, em, ed, Math.floor(mm / 60), mm % 60, EST_TZ);
        const t = slot.getTime();
        if (t < now) continue;
        if (t < viewerDayStart.getTime() || t >= viewerDayEnd.getTime()) continue;
        const iso = slot.toISOString();
        // count closers who are (a) available at this minute and (b) not already assigned to this slot
        const assigned = assignedBusy.get(iso) ?? new Set<string>();
        let avail = 0;
        for (const [cid, windows] of byCloser.entries()) {
          if (assigned.has(cid)) continue;
          if (windows.some((w) => mm >= w.s && mm + SLOT_MINUTES <= w.e)) avail += 1;
        }
        // subtract pending-assignment bookings (consume one closer each)
        avail -= pendingPerSlot.get(iso) ?? 0;
        if (avail > 0) slotMap.set(iso, avail);
      }
    }
    return Array.from(slotMap.entries())
      .sort(([a],[b]) => (a < b ? -1 : 1))
      .map(([iso, capacity]) => ({ iso, capacity }));
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

    const start = new Date(data.slot_start);
    const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);

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

export const createCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    zoom_user_email: z.string().trim().email().max(200).optional().or(z.literal("")),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("closers").insert({
      full_name: data.full_name,
      email: data.email.toLowerCase(),
      zoom_user_email: data.zoom_user_email || data.email.toLowerCase(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    // Send Supabase auth invite (best-effort)
    try {
      await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
    } catch {
      // ignore — admin can resend later
    }
    return { id: row.id };
  });

export const updateCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    full_name: z.string().trim().min(1).max(200).optional(),
    zoom_user_email: z.string().trim().email().max(200).optional(),
    active: z.boolean().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("closers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

export const listCloserAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("closer_availability_rules")
      .select("id, day_of_week, start_minute, end_minute")
      .eq("closer_id", data.closer_id)
      .order("day_of_week");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const replaceCloserAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    closer_id: z.string().uuid(),
    rules: z.array(CloserAvailRule).max(100),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Permission: admin OR own row
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: c } = await context.supabase
        .from("closers").select("id").eq("id", data.closer_id).eq("user_id", context.userId).maybeSingle();
      if (!c) throw new Error("Forbidden");
    }
    const del = await supabaseAdmin.from("closer_availability_rules").delete().eq("closer_id", data.closer_id);
    if (del.error) throw new Error(del.error.message);
    if (data.rules.length > 0) {
      const ins = await supabaseAdmin.from("closer_availability_rules").insert(
        data.rules.map((r) => ({ ...r, closer_id: data.closer_id })),
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
      .select("*, closers:assigned_closer_id (full_name, email, zoom_user_email)")
      .order("slot_start", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [], isAdmin: !!isAdmin };
  });

async function sendCloserBookingEmail(input: {
  bookingId: string;
  recipientEmail: string;
  applicantName: string;
  scheduledAt: string;
  meetingUrl: string | null;
}) {
  try {
    const origin = process.env.LOVABLE_APP_URL || process.env.PUBLIC_APP_URL;
    if (!origin) return;
    await fetch(`${origin}/lovable/email/transactional/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LOVABLE_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        templateName: "booking-confirmation",
        recipientEmail: input.recipientEmail,
        idempotencyKey: `closer-booking-${input.bookingId}`,
        templateData: {
          name: input.applicantName,
          scheduledAt: input.scheduledAt,
          meetingUrl: input.meetingUrl,
          durationMinutes: SLOT_MINUTES,
        },
      }),
    });
  } catch { /* best effort */ }
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

    const zoom = await createZoomMeetingForUser({
      zoomUserEmail: (closer.zoom_user_email as string) || (closer.email as string),
      topic: `Sales call — ${booking.applicant_name}`,
      start_time: booking.slot_start as string,
      duration: SLOT_MINUTES,
    });

    const { error: uerr } = await supabaseAdmin.from("closer_bookings").update({
      assigned_closer_id: data.closer_id,
      status: "assigned",
      zoom_join_url: zoom.join_url,
      zoom_meeting_id: zoom.meeting_id,
    }).eq("id", data.booking_id);
    if (uerr) throw new Error(uerr.message);

    void sendCloserBookingEmail({
      bookingId: data.booking_id,
      recipientEmail: booking.applicant_email as string,
      applicantName: booking.applicant_name as string,
      scheduledAt: booking.slot_start as string,
      meetingUrl: zoom.join_url,
    });

    return { ok: true, zoom_join_url: zoom.join_url };
  });

export const unassignCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("closer_bookings").update({
      assigned_closer_id: null,
      status: "pending_assignment",
      zoom_join_url: null,
      zoom_meeting_id: null,
    }).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelCloserBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ booking_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("closer_bookings")
      .update({ status: "cancelled" }).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
