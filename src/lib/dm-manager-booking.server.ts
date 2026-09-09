import { EST_TZ, zonedDateKey, zonedDayOfWeek, zonedWallToUTC, formatScheduledLabel, createZoomMeetingOnCloserAccount } from "@/lib/b2b-booking.server";

export const MANAGER_SLOT_MINUTES = 30;
export const MANAGER_DAYS_OUT = 30;

// Default 1-on-1 hours (ET) when a manager hasn't set their own: Mon–Fri 9am–5pm
const DEFAULT_RULES = [1, 2, 3, 4, 5].map((day_of_week) => ({
  day_of_week,
  start_minute: 9 * 60,
  end_minute: 17 * 60,
}));

export type AvailabilityRule = { day_of_week: number; start_minute: number; end_minute: number };

export function managerBookingLink(slug: string) {
  return `https://conversionlab.space/call/${slug}`;
}

export function slugifyName(input: string) {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "manager";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Resolve a manager's dm_setters row by their public booking slug. */
export async function getManagerBySlug(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from("dm_setters") as any)
    .select("id, full_name, email, booking_slug, is_manager")
    .eq("booking_slug", slug.toLowerCase())
    .maybeSingle();
  if (!data || !data.is_manager) return null;
  return data as { id: string; full_name: string | null; email: string | null; booking_slug: string };
}

export async function getManagerRules(managerId: string): Promise<AvailabilityRule[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from("dm_manager_availability_rules") as any)
    .select("day_of_week, start_minute, end_minute")
    .eq("manager_id", managerId);
  const rows = (data ?? []) as AvailabilityRule[];
  return rows.length ? rows : DEFAULT_RULES;
}

/** Open slot start times (ISO) for one ET calendar day. */
export async function computeManagerSlots(managerId: string, dateKey: string): Promise<string[]> {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return [];
  const rules = await getManagerRules(managerId);
  const probe = zonedWallToUTC(y, m, d, 12, 0, EST_TZ);
  const dow = zonedDayOfWeek(probe, EST_TZ);
  const dayRules = rules.filter((r) => r.day_of_week === dow);
  if (!dayRules.length) return [];

  const dayStart = zonedWallToUTC(y, m, d, 0, 0, EST_TZ);
  const dayEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: booked } = await (supabaseAdmin.from("dm_manager_bookings") as any)
    .select("scheduled_at, status")
    .eq("manager_id", managerId)
    .gte("scheduled_at", dayStart.toISOString())
    .lt("scheduled_at", dayEnd.toISOString());
  const taken = new Set(
    ((booked ?? []) as { scheduled_at: string; status: string }[])
      .filter((b) => b.status !== "cancelled")
      .map((b) => new Date(b.scheduled_at).getTime()),
  );

  const now = Date.now() + 60 * 60 * 1000; // 1h lead time
  const out: string[] = [];
  for (const rule of dayRules) {
    for (let mins = rule.start_minute; mins + MANAGER_SLOT_MINUTES <= rule.end_minute; mins += MANAGER_SLOT_MINUTES) {
      const start = zonedWallToUTC(y, m, d, Math.floor(mins / 60), mins % 60, EST_TZ);
      if (zonedDateKey(start, EST_TZ) !== dateKey) continue;
      if (start.getTime() < now) continue;
      if (taken.has(start.getTime())) continue;
      out.push(start.toISOString());
    }
  }
  return [...new Set(out)].sort();
}

/** Create the booking row, a Zoom link and send the invite email. */
export async function createManagerBooking(input: {
  managerId: string;
  managerName: string | null;
  name: string;
  email: string;
  phone?: string | null;
  scheduledAt: string;
  timezone?: string | null;
  notes?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const startMs = new Date(input.scheduledAt).getTime();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clash } = await (supabaseAdmin.from("dm_manager_bookings") as any)
    .select("id")
    .eq("manager_id", input.managerId)
    .eq("scheduled_at", new Date(startMs).toISOString())
    .neq("status", "cancelled")
    .maybeSingle();
  if (clash) throw new Error("That time was just taken. Please pick another.");

  const topic = `1-on-1 call with ${input.managerName || "Conversion Lab"}`;
  // Prefer the manager's own Zoom app credentials; fall back to the platform account.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creds } = await (supabaseAdmin.from("dm_manager_zoom_credentials") as any)
    .select("zoom_account_id, zoom_client_id, zoom_client_secret, zoom_host_email")
    .eq("manager_id", input.managerId)
    .maybeSingle();
  const hasOwn = Boolean(creds?.zoom_account_id && creds?.zoom_client_id && creds?.zoom_client_secret);
  const meetingUrl = await createZoomMeetingOnCloserAccount({
    accountId: hasOwn ? creds.zoom_account_id : process.env["ZOOM_ACCOUNT_ID"] ?? null,
    clientId: hasOwn ? creds.zoom_client_id : process.env["ZOOM_CLIENT_ID"] ?? null,
    clientSecret: hasOwn ? creds.zoom_client_secret : process.env["ZOOM_CLIENT_SECRET"] ?? null,
    hostEmail: hasOwn ? (creds.zoom_host_email as string | null) ?? null : null,
    topic,
    start_time: new Date(startMs).toISOString(),
    duration: MANAGER_SLOT_MINUTES,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (supabaseAdmin.from("dm_manager_bookings") as any)
    .insert({
      manager_id: input.managerId,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      scheduled_at: new Date(startMs).toISOString(),
      timezone: input.timezone || null,
      meeting_url: meetingUrl,
      notes: input.notes || null,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message || "Could not save your booking.");

  const scheduledLabel = formatScheduledLabel(new Date(startMs).toISOString(), input.timezone ?? EST_TZ);
  try {
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    await sendTransactional({
      templateName: "one-on-one-call",
      recipientEmail: input.email,
      idempotencyKey: `dm-manager-booking-${row.id}`,
      templateData: {
        name: input.name,
        managerName: input.managerName ?? undefined,
        scheduledLabel,
        meetingUrl,
        durationMinutes: MANAGER_SLOT_MINUTES,
      },
    });
  } catch {
    // Email failure must not lose the booking.
  }

  // Notify the manager that a new interview landed on their calendar.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mgr } = await (supabaseAdmin.from("dm_setters") as any)
      .select("email, full_name")
      .eq("id", input.managerId)
      .maybeSingle();
    const managerEmail = (mgr?.email as string | null) || null;
    if (managerEmail) {
      const managerLabel = formatScheduledLabel(new Date(startMs).toISOString(), EST_TZ);
      const { sendTransactional } = await import("@/lib/email/transactional.server");
      await sendTransactional({
        templateName: "one-on-one-call-manager",
        recipientEmail: managerEmail,
        idempotencyKey: `dm-manager-booking-mgr-${row.id}`,
        templateData: {
          managerName: (mgr?.full_name as string | null) ?? input.managerName ?? undefined,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          scheduledLabel: managerLabel,
          meetingUrl,
          durationMinutes: MANAGER_SLOT_MINUTES,
          timezone: input.timezone || null,
        },
      });
    }
  } catch {
    // Notification failure must not lose the booking.
  }

  return { id: row.id as string, meeting_url: meetingUrl, scheduled_label: scheduledLabel };
}
