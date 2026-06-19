import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Public: submit application with email + return booking token ----------
const InvestEnum = z.enum(["Yes", "No", "Maybe"]);
const CreditEnum = z.enum(["Below 600", "600-650", "650-700", "700-750", "750-800", "800-850"]);

const SubmitSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(200).optional().nullable(),
  why_remote_sales: z.string().trim().max(2000).optional().nullable(),
  current_monthly_income: z.string().trim().min(1).max(60),
  desired_monthly_income: z.string().trim().min(1).max(60),
  open_to_invest: InvestEnum.optional().nullable(),
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

    // Create Google Calendar event titled "<Closer name> with <Lead name>"
    const eventTitle = `${closer.full_name} with ${booking.applicant_name}`;
    const descLines = [
      `Lead: ${booking.applicant_name}`,
      booking.applicant_email ? `Email: ${booking.applicant_email}` : "",
      booking.applicant_phone ? `Phone: ${booking.applicant_phone}` : "",
      zoom.join_url ? `\nZoom: ${zoom.join_url}` : "",
    ].filter(Boolean).join("\n");
    const calEventId = await gcalCreateEvent({
      summary: eventTitle,
      description: descLines,
      startISO: booking.slot_start as string,
      endISO: booking.slot_end as string,
      attendees: [closer.email as string, booking.applicant_email as string],
    });

    const { error: uerr } = await supabaseAdmin.from("closer_bookings").update({
      assigned_closer_id: data.closer_id,
      status: "assigned",
      zoom_join_url: zoom.join_url,
      zoom_meeting_id: zoom.meeting_id,
      google_calendar_event_id: calEventId,
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
const OutcomeEnum = z.enum(["not_interested", "disqualified", "closed", "deposit"]);
const CommissionPctEnum = z.union([z.literal(10), z.literal(15), z.literal(20)]);

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
      .select("id, applicant_name, applicant_email, slot_start, outcome, outcome_at, deal_amount, deposit_amount, follow_up_amount, commission_percent, commission_amount, closers:assigned_closer_id (id, full_name, email)")
      .in("outcome", ["closed", "deposit"])
      .order("outcome_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
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

// ---------- Closer: list my commissions from B2C bookings ----------
export const listMyCloserCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: closer } = await context.supabase
      .from("closers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!closer) return { rows: [], totals: { closed: 0, deposit: 0, commission: 0 } };
    const { data, error } = await context.supabase
      .from("closer_bookings")
      .select("id, applicant_name, slot_start, outcome, outcome_at, deal_amount, deposit_amount, follow_up_amount, commission_percent, commission_amount")
      .eq("assigned_closer_id", closer.id)
      .in("outcome", ["closed", "deposit"])
      .order("outcome_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const totals = rows.reduce((acc, r) => {
      const c = Number(r.commission_amount ?? 0);
      acc.commission += c;
      if (r.outcome === "closed") acc.closed += Number(r.deal_amount ?? 0);
      if (r.outcome === "deposit") acc.deposit += Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0);
      return acc;
    }, { closed: 0, deposit: 0, commission: 0 });
    return { rows, totals };
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
