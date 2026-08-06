// Server-only B2B booking core. Shared by the authenticated setter flow
// (src/lib/api/cl.functions.ts) and the public per-setter booking links
// (src/lib/api/public-booking.functions.ts) so availability and booking
// behaviour can never drift between them.

export const EST_TZ = "America/New_York";
export const APP_ORIGIN = "https://conversionlab.space";

export function zonedDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function zonedDayOfWeek(d: Date, tz: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
export function zonedWallToUTC(y: number, m: number, d: number, hh: number, mm: number, tz: string) {
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

export function formatScheduledLabel(scheduledAt: string, tz: string | null | undefined): string {
  const effectiveTz = tz && tz.trim() ? tz : EST_TZ;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: effectiveTz,
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(scheduledAt));
  } catch {
    return scheduledAt;
  }
}

export async function getB2bSettingsRow(): Promise<{ slot_minutes: number; days_out: number }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin.from("b2b_settings") as any)
      .select("slot_minutes, days_out").eq("id", 1).maybeSingle();
    return {
      slot_minutes: (data?.slot_minutes as number | undefined) ?? 30,
      days_out: (data?.days_out as number | undefined) ?? 14,
    };
  } catch {
    return { slot_minutes: 30, days_out: 14 };
  }
}

export async function getSlotMinutes(): Promise<number> {
  return (await getB2bSettingsRow()).slot_minutes;
}

// ---------- Zoom (per-closer credentials) ----------
async function getCloserZoomAccessToken(creds: {
  accountId: string | null; clientId: string | null; clientSecret: string | null;
}): Promise<string | null> {
  if (!creds.accountId || !creds.clientId || !creds.clientSecret) return null;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${creds.accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

export async function createZoomMeetingOnCloserAccount(input: {
  accountId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  topic: string;
  start_time: string;
  duration: number;
}): Promise<string | null> {
  try {
    const token = await getCloserZoomAccessToken(input);
    if (!token) return null;
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: input.topic,
        type: 2,
        start_time: input.start_time,
        duration: input.duration,
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { join_url?: string };
    return j.join_url ?? null;
  } catch {
    return null;
  }
}

function generateConfirmationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendBookingConfirmationEmail(input: {
  appointmentId: string;
  recipientEmail: string;
  leadName: string;
  scheduledAt: string;
  meetingUrl: string | null;
  durationMinutes: number;
  timezone?: string | null;
  idempotencySuffix?: string;
}) {
  try {
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let confirmationToken: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabaseAdmin.from("appointments") as any)
      .select("confirmation_token, timezone").eq("id", input.appointmentId).maybeSingle();
    confirmationToken = (existing?.confirmation_token as string | null) ?? null;
    const storedTz = (existing?.timezone as string | null) ?? null;
    if (!confirmationToken) {
      confirmationToken = generateConfirmationToken();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("appointments") as any)
        .update({ confirmation_token: confirmationToken }).eq("id", input.appointmentId);
    }
    const confirmUrl = `${APP_ORIGIN}/confirm-booking?token=${confirmationToken}`;
    const scheduledLabel = formatScheduledLabel(input.scheduledAt, input.timezone ?? storedTz);
    await sendTransactional({
      templateName: "booking-confirmation",
      recipientEmail: input.recipientEmail,
      idempotencyKey: `booking-confirm-${input.appointmentId}${input.idempotencySuffix ? `-${input.idempotencySuffix}` : ""}`,
      templateData: {
        name: input.leadName,
        scheduledAt: input.scheduledAt,
        scheduledLabel,
        meetingUrl: input.meetingUrl,
        durationMinutes: input.durationMinutes,
        confirmUrl,
      },
    });
  } catch (e) {
    console.warn("[booking-confirm] send failed", e);
  }
}

// ---------- Availability ----------
// A slot is offered when it falls inside the global B2B window
// (availability_rules) AND at least one active B2B closer with a connected
// Google Calendar is free, minus pending (unassigned) bookings on that slot.
export async function computeB2bSlots(input: { date: string; tz?: string }): Promise<string[]> {
  const viewerTz = input.tz || EST_TZ;
  const [vy, vm, vd] = input.date.split("-").map(Number);
  const viewerDayStart = zonedWallToUTC(vy, vm, vd, 0, 0, viewerTz);
  const viewerDayEnd = zonedWallToUTC(vy, vm, vd + 1, 0, 0, viewerTz);

  const { slot_minutes: SLOT, days_out } = await getB2bSettingsRow();
  if (viewerDayStart.getTime() > Date.now() + days_out * 24 * 60 * 60 * 1000) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: globalRules } = await (supabaseAdmin.from("availability_rules") as any)
    .select("day_of_week, start_minute, end_minute");
  const rules = ((globalRules ?? []) as Array<{ day_of_week: number; start_minute: number; end_minute: number }>);
  if (rules.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closers } = await (supabaseAdmin.from("b2b_closers") as any)
    .select("id, user_id").eq("active", true);
  const activeClosers = ((closers ?? []) as Array<{ id: string; user_id: string | null }>);
  if (activeClosers.length === 0) return [];

  const closerUserIds = activeClosers.map((c) => c.user_id).filter((v): v is string => !!v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conns } = await (supabaseAdmin.from("app_user_connections") as any)
    .select("user_id")
    .eq("connector_id", "google_calendar")
    .in("user_id", closerUserIds.length > 0 ? closerUserIds : ["00000000-0000-0000-0000-000000000000"]);
  const connectedSet = new Set(((conns ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const closerRows = activeClosers.filter((c) => c.user_id && connectedSet.has(c.user_id));
  const closerIds = closerRows.map((c) => c.id);
  if (closerIds.length === 0) return [];

  // Per-closer availability windows (EST). A closer with no rows is treated as
  // available across the whole global window.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closerRules } = await (supabaseAdmin.from("b2b_closer_availability_rules") as any)
    .select("closer_id, day_of_week, start_minute, end_minute")
    .in("closer_id", closerIds);
  const rulesByCloser = new Map<string, Array<{ day_of_week: number; start_minute: number; end_minute: number }>>();
  for (const r of ((closerRules ?? []) as Array<{ closer_id: string; day_of_week: number; start_minute: number; end_minute: number }>)) {
    const arr = rulesByCloser.get(r.closer_id) ?? [];
    arr.push(r);
    rulesByCloser.set(r.closer_id, arr);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bookings } = await (supabaseAdmin.from("appointments") as any)
    .select("scheduled_at, b2b_closer_id, status")
    .eq("type", "booking")
    .gte("scheduled_at", new Date(viewerDayStart.getTime() - SLOT * 60_000).toISOString())
    .lt("scheduled_at", new Date(viewerDayEnd.getTime() + SLOT * 60_000).toISOString());
  const allBookings = (bookings ?? []) as Array<{ scheduled_at: string; b2b_closer_id: string | null; status: string | null }>;

  const { getBusyIntervalsForUser } = await import("@/lib/googleCalendar.server");
  const gcalBusyByCloser = new Map<string, Array<{ start: number; end: number }>>();
  await Promise.all(
    closerRows.map(async (c) => {
      if (!c.user_id) return;
      const busy = await getBusyIntervalsForUser(
        c.user_id,
        new Date(viewerDayStart.getTime() - SLOT * 60_000).toISOString(),
        new Date(viewerDayEnd.getTime() + SLOT * 60_000).toISOString(),
      );
      if (busy.length > 0) gcalBusyByCloser.set(c.id, busy);
    }),
  );

  const estDates = new Set<string>();
  estDates.add(zonedDateKey(viewerDayStart, EST_TZ));
  estDates.add(zonedDateKey(new Date(viewerDayEnd.getTime() - 1), EST_TZ));

  const now = Date.now();
  const slotMs = SLOT * 60_000;
  const found = new Set<string>();

  for (const estKey of estDates) {
    const [ey, em, ed] = estKey.split("-").map(Number);
    const probe = zonedWallToUTC(ey, em, ed, 12, 0, EST_TZ);
    const dow = zonedDayOfWeek(probe, EST_TZ);
    const globalWindows = rules.filter((r) => r.day_of_week === dow);
    if (globalWindows.length === 0) continue;

    for (const w of globalWindows) {
      for (let mm = w.start_minute; mm + SLOT <= w.end_minute; mm += SLOT) {
        const slot = zonedWallToUTC(ey, em, ed, Math.floor(mm / 60), mm % 60, EST_TZ);
        const t = slot.getTime();
        if (t < now) continue;
        if (t < viewerDayStart.getTime() || t >= viewerDayEnd.getTime()) continue;

        const slotEnd = t + slotMs;
        let availableClosers = 0;
        for (const cid of closerIds) {
          const own = rulesByCloser.get(cid);
          if (own && own.length > 0) {
            const inOwnWindow = own.some(
              (r) => r.day_of_week === dow && mm >= r.start_minute && mm + SLOT <= r.end_minute,
            );
            if (!inOwnWindow) continue;
          }
          const apptConflict = allBookings.some((b) => {
            if (b.b2b_closer_id !== cid) return false;
            if (b.status === "cancelled") return false;
            const bs = new Date(b.scheduled_at).getTime();
            return bs < slotEnd && bs + slotMs > t;
          });
          if (apptConflict) continue;
          const gcalConflict = (gcalBusyByCloser.get(cid) ?? []).some((iv) => iv.start < slotEnd && iv.end > t);
          if (gcalConflict) continue;
          availableClosers += 1;
        }

        const pendingAtSlot = allBookings.filter((b) =>
          b.b2b_closer_id == null
          && b.status === "pending_assignment"
          && new Date(b.scheduled_at).getTime() === t
        ).length;

        if (availableClosers - pendingAtSlot > 0) found.add(slot.toISOString());
      }
    }
  }

  return Array.from(found).sort();
}

// ---------- Booking core ----------
export type B2bBookingLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export async function bookB2bCore(input: {
  lead: B2bBookingLead;
  /** Setter credited with the booking. */
  setterUserId: string;
  scheduledAt: string;
  timezone?: string | null;
  note?: string | null;
}): Promise<{ appointment_id: string; closer_name: string | null; meeting_url: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lead = input.lead;
  if (!lead.email) throw new Error("An email is required to book.");

  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Lead";
  const slotStart = new Date(input.scheduledAt);
  const slotMs = (await getSlotMinutes()) * 60_000;
  const slotEnd = slotStart.getTime() + slotMs;

  // 1. Validate the slot falls inside the global B2B window (EST).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: globalRules } = await (supabaseAdmin.from("availability_rules") as any)
    .select("day_of_week, start_minute, end_minute");
  const rules = ((globalRules ?? []) as Array<{ day_of_week: number; start_minute: number; end_minute: number }>);
  const estKey = zonedDateKey(slotStart, EST_TZ);
  const [ey, em, ed] = estKey.split("-").map(Number);
  const dow = zonedDayOfWeek(slotStart, EST_TZ);
  const estHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: EST_TZ, hour: "2-digit", hourCycle: "h23" }).format(slotStart));
  const estMin = Number(new Intl.DateTimeFormat("en-US", { timeZone: EST_TZ, minute: "2-digit" }).format(slotStart));
  const slotMinuteOfDay = estHour * 60 + estMin;
  const inWindow = rules.some(
    (r) => r.day_of_week === dow && slotMinuteOfDay >= r.start_minute && slotMinuteOfDay + (slotMs / 60_000) <= r.end_minute,
  );
  const estAligned = zonedWallToUTC(ey, em, ed, Math.floor(slotMinuteOfDay / 60), slotMinuteOfDay % 60, EST_TZ);
  if (!inWindow || estAligned.getTime() !== slotStart.getTime()) {
    throw new Error("That time isn't available anymore.");
  }
  if (slotStart.getTime() < Date.now()) throw new Error("That time is in the past.");

  // 2. Eligible closers: active + connected Google Calendar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closerRows } = await (supabaseAdmin.from("b2b_closers") as any)
    .select("id, user_id, full_name").eq("active", true).order("id", { ascending: true });
  const allActive = ((closerRows ?? []) as Array<{ id: string; user_id: string | null; full_name: string | null }>);
  if (allActive.length === 0) throw new Error("No B2B closers are set up yet.");

  const activeUserIds = allActive.map((c) => c.user_id).filter((v): v is string => !!v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conns2 } = await (supabaseAdmin.from("app_user_connections") as any)
    .select("user_id")
    .eq("connector_id", "google_calendar")
    .in("user_id", activeUserIds.length > 0 ? activeUserIds : ["00000000-0000-0000-0000-000000000000"]);
  const connectedSet2 = new Set(((conns2 ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const closers = allActive.filter((c) => c.user_id && connectedSet2.has(c.user_id));
  if (closers.length === 0) throw new Error("No closers with a connected calendar are available.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overlappingAppts } = await (supabaseAdmin.from("appointments") as any)
    .select("scheduled_at, b2b_closer_id, status")
    .eq("type", "booking")
    .gte("scheduled_at", new Date(slotStart.getTime() - slotMs).toISOString())
    .lt("scheduled_at", new Date(slotEnd + slotMs).toISOString());
  const appts = ((overlappingAppts ?? []) as Array<{ scheduled_at: string; b2b_closer_id: string | null; status: string | null }>);

  const { getBusyIntervalsForUser } = await import("@/lib/googleCalendar.server");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pickRules } = await (supabaseAdmin.from("b2b_closer_availability_rules") as any)
    .select("closer_id, day_of_week, start_minute, end_minute")
    .in("closer_id", closers.map((c) => c.id));
  const pickRulesByCloser = new Map<string, Array<{ day_of_week: number; start_minute: number; end_minute: number }>>();
  for (const r of ((pickRules ?? []) as Array<{ closer_id: string; day_of_week: number; start_minute: number; end_minute: number }>)) {
    const arr = pickRulesByCloser.get(r.closer_id) ?? [];
    arr.push(r);
    pickRulesByCloser.set(r.closer_id, arr);
  }

  let picked: { id: string; user_id: string | null; full_name: string | null } | null = null;
  for (const c of closers) {
    const own = pickRulesByCloser.get(c.id);
    if (own && own.length > 0) {
      const inOwnWindow = own.some(
        (r) => r.day_of_week === dow
          && slotMinuteOfDay >= r.start_minute
          && slotMinuteOfDay + slotMs / 60_000 <= r.end_minute,
      );
      if (!inOwnWindow) continue;
    }
    const apptConflict = appts.some((b) => {
      if (b.b2b_closer_id !== c.id) return false;
      if (b.status === "cancelled") return false;
      const bs = new Date(b.scheduled_at).getTime();
      return bs < slotEnd && bs + slotMs > slotStart.getTime();
    });
    if (apptConflict) continue;
    if (c.user_id) {
      const busy = await getBusyIntervalsForUser(
        c.user_id,
        new Date(slotStart.getTime() - slotMs).toISOString(),
        new Date(slotEnd + slotMs).toISOString(),
      );
      if (busy.some((iv) => iv.start < slotEnd && iv.end > slotStart.getTime())) continue;
    }
    picked = c;
    break;
  }
  if (!picked) throw new Error("That time was just taken — pick another.");

  // 3. Appointment row, already assigned.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appt, error: insErr } = await (supabaseAdmin.from("appointments") as any)
    .insert({
      user_id: input.setterUserId,
      lead_id: null,
      type: "booking",
      scheduled_at: slotStart.toISOString(),
      name: leadName,
      phone: lead.phone,
      email: lead.email,
      status: "assigned",
      b2b_closer_id: picked.id,
      timezone: input.timezone ?? null,
      context: input.note ?? null,
    })
    .select("id")
    .single();
  if (insErr || !appt) throw new Error(insErr?.message || "Could not create appointment.");
  const appointmentId = appt.id as string;

  // 4. Zoom meeting (best-effort).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creds } = await (supabaseAdmin.from("b2b_closer_zoom_credentials") as any)
    .select("zoom_account_id, zoom_client_id, zoom_client_secret")
    .eq("closer_id", picked.id).maybeSingle();
  const slotMinutes = slotMs / 60_000;
  const meetingUrl = await createZoomMeetingOnCloserAccount({
    accountId: (creds?.zoom_account_id as string | null) ?? null,
    clientId: (creds?.zoom_client_id as string | null) ?? null,
    clientSecret: (creds?.zoom_client_secret as string | null) ?? null,
    topic: `${leadName} — Sales Call`,
    start_time: slotStart.toISOString(),
    duration: slotMinutes,
  });
  if (meetingUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("appointments") as any).update({ meeting_url: meetingUrl }).eq("id", appointmentId);
  }

  // 5. Google Calendar event on the closer's calendar (best-effort).
  if (picked.user_id) {
    try {
      const { createCalendarEventForUser } = await import("@/lib/googleCalendar.server");
      const descLines = [
        `Lead: ${leadName}`,
        lead.email ? `Email: ${lead.email}` : null,
        lead.phone ? `Phone: ${lead.phone}` : null,
        lead.company ? `Company: ${lead.company}` : null,
        meetingUrl ? `Zoom: ${meetingUrl}` : null,
        input.note ? `\nNotes:\n${input.note}` : null,
      ].filter(Boolean).join("\n");
      await createCalendarEventForUser(picked.user_id, {
        summary: `${leadName} — Sales Call`,
        description: descLines,
        startISO: slotStart.toISOString(),
        endISO: new Date(slotStart.getTime() + slotMs).toISOString(),
        timezone: input.timezone ?? null,
        attendees: lead.email ? [{ email: lead.email, displayName: leadName }] : [],
        meetingUrl,
      });
    } catch (e) {
      console.warn("[b2b-gcal-insert] failed", e);
    }
  }

  // 6. Prospect confirmation email.
  await sendBookingConfirmationEmail({
    appointmentId,
    recipientEmail: lead.email,
    leadName,
    scheduledAt: slotStart.toISOString(),
    meetingUrl,
    durationMinutes: slotMinutes,
    timezone: input.timezone ?? null,
  });

  // 7. Notify the assigned closer.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closerRow } = await (supabaseAdmin.from("b2b_closers") as any)
      .select("email, full_name").eq("id", picked.id).maybeSingle();
    const closerEmail = (closerRow?.email as string | null) ?? null;
    if (closerEmail) {
      const { sendTransactional } = await import("@/lib/email/transactional.server");
      await sendTransactional({
        templateName: "closer-call-closer",
        recipientEmail: closerEmail,
        idempotencyKey: `b2b-closer-notify-${appointmentId}`,
        templateData: {
          closerName: (closerRow?.full_name as string | null) ?? picked.full_name ?? null,
          applicantName: leadName,
          applicantEmail: lead.email,
          applicantPhone: lead.phone,
          scheduledAt: slotStart.toISOString(),
          scheduledLabel: formatScheduledLabel(slotStart.toISOString(), input.timezone ?? null),
          meetingUrl,
          durationMinutes: slotMinutes,
        },
      });
    }
  } catch (e) {
    console.warn("[b2b-closer-notify] send failed", e);
  }

  // 8. Log outcome on the pool lead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin.from("b2b_call_attempts") as any).insert({
    pool_lead_id: lead.id,
    setter_id: input.setterUserId,
    outcome: "booked",
    note: input.note ?? null,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin.from("b2b_lead_pool") as any)
    .update({ status: "booked", didnt_pick_up: false, last_attempt_at: new Date().toISOString() })
    .eq("id", lead.id);

  return { appointment_id: appointmentId, closer_name: picked.full_name, meeting_url: meetingUrl };
}

// ---------- Per-setter booking links ----------
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Returns the setter's booking slug, generating one on first use. */
export async function ensureBookingSlug(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabaseAdmin.from("profiles") as any)
    .select("b2b_booking_slug, full_name, email").eq("user_id", userId).maybeSingle();
  const existing = (profile?.b2b_booking_slug as string | null) ?? null;
  if (existing) return existing;

  const base = slugify(
    (profile?.full_name as string | null)?.trim()
    || ((profile?.email as string | null) ?? "setter").split("@")[0],
  ) || "setter";
  let slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("profiles") as any)
      .update({ b2b_booking_slug: slug }).eq("user_id", userId);
    if (!error) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }
  throw new Error("Could not create a booking link.");
}

export function bookingLinkFor(slug: string) {
  return `${APP_ORIGIN}/book/${slug}`;
}
