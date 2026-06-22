import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// ---------- Bootstrap (first admin) ----------
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("An admin already exists.");
    const { error } = await supabaseAdmin
      .from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- Profile & Role ----------
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    return {
      userId,
      profile,
      mustChangePassword: !!profile?.must_change_password,
      isAdmin: roleSet.has("admin"),
      isClient: roleSet.has("client"),
      isCloser: roleSet.has("closer"),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    full_name: z.string().max(120).optional(),
    company_name: z.string().max(120).optional(),
    timezone: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Modules ----------
export const listModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: modules }, { data: completions }] = await Promise.all([
      supabase.from("modules").select("*").eq("is_active", true).order("order_index"),
      supabase.from("module_completions").select("module_id").eq("user_id", userId),
    ]);
    const done = new Set((completions ?? []).map((c) => c.module_id));
    return (modules ?? []).map((m) => ({ ...m, completed: done.has(m.id) }));
  });

export const getModule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: module } = await supabase.from("modules").select("*").eq("id", data.id).maybeSingle();
    if (!module) throw new Error("Module not found");
    const { data: completion } = await supabase.from("module_completions")
      .select("id").eq("user_id", userId).eq("module_id", data.id).maybeSingle();
    return { ...module, completed: !!completion };
  });

export const markModuleComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ module_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: note } = await supabase.from("module_notes")
      .select("content").eq("user_id", userId).eq("module_id", data.module_id).maybeSingle();
    if (!note || (note.content ?? "").trim().length < 100) {
      throw new Error("Please write at least 100 characters of notes before marking complete.");
    }
    const { error } = await supabase.from("module_completions")
      .upsert({ user_id: userId, module_id: data.module_id }, { onConflict: "user_id,module_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyModuleNote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ module_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: note } = await supabase.from("module_notes")
      .select("content").eq("user_id", userId).eq("module_id", data.module_id).maybeSingle();
    return { content: note?.content ?? "" };
  });

export const upsertMyModuleNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ module_id: z.string().uuid(), content: z.string().max(20000) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("module_notes")
      .upsert({ user_id: userId, module_id: data.module_id, content: data.content }, { onConflict: "user_id,module_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin module CRUD
const ModuleInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  video_url: z.string().max(500).optional().nullable(),
  order_index: z.number().int(),
  is_active: z.boolean().default(true),
});
export const createModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ModuleInput.parse)
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase.from("modules").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });
export const updateModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ModuleInput.extend({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("modules").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const deleteModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("modules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Quizzes ----------
export const listQuizQuestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ module_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    // Use admin client; strip correct_answer for non-admins so it never reaches the browser.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    const { data: qs } = await supabaseAdmin
      .from("quiz_questions").select("*").eq("module_id", data.module_id).order("created_at");
    const rows = qs ?? [];
    if (isAdmin) return rows;
    // Null out correct_answer for non-admins; type shape preserved for callers.
    return rows.map((r) => ({ ...r, correct_answer: null as unknown as number }));
  });

export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    module_id: z.string().uuid(),
    answers: z.array(z.number().int()),
  }).parse)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: qs } = await supabaseAdmin
      .from("quiz_questions").select("id, correct_answer").eq("module_id", data.module_id).order("created_at");
    const questions = qs ?? [];
    let correct = 0;
    questions.forEach((q, i) => { if (data.answers[i] === q.correct_answer) correct++; });
    const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    const { error } = await supabaseAdmin.from("quiz_attempts").insert({
      user_id: userId, module_id: data.module_id, score, answers: data.answers,
    });
    if (error) throw new Error(error.message);
    return { score, total: questions.length, correct };
  });

export const listMyAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ module_id: z.string().uuid().optional() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("quiz_attempts").select("*").eq("user_id", userId).order("completed_at", { ascending: false });
    if (data.module_id) q = q.eq("module_id", data.module_id);
    const { data: rows } = await q;
    return rows ?? [];
  });

// Admin quiz CRUD
const QuestionInput = z.object({
  module_id: z.string().uuid(),
  question_text: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  correct_answer: z.number().int().min(0),
});
export const createQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(QuestionInput.parse)
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase.from("quiz_questions").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });
export const updateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(QuestionInput.extend({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("quiz_questions").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("quiz_questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Leads ----------
export const listMyLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("leads").select("*")
      .eq("assigned_user_id", userId).order("created_at", { ascending: false });
    return data ?? [];
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return lead;
  });

const LeadStatus = z.enum(["New","Contacted","No Answer","Interested","Booked","Not Interested","Follow Up","Call Again","Call Back"]);

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    status: LeadStatus.optional(),
    notes: z.string().max(5000).optional().nullable(),
    contacted: z.boolean().optional(),
    do_not_contact: z.boolean().optional(),
    callback_at: z.string().datetime().nullable().optional(),
    email: z.string().trim().email().max(200).nullable().optional().or(z.literal("").transform(() => null)),
  }).parse)
  .handler(async ({ data, context }) => {
    const patch: Database["public"]["Tables"]["leads"]["Update"] = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.do_not_contact !== undefined) patch.do_not_contact = data.do_not_contact;
    if (data.callback_at !== undefined) patch.callback_at = data.callback_at;
    if (data.email !== undefined) patch.email = data.email;
    if (data.contacted === true) patch.contacted_at = new Date().toISOString();
    if (data.contacted === false) patch.contacted_at = null;
    const { error } = await context.supabase.from("leads").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    // When the setter marks an outcome status for the lead, count the most
    // recent dial as a "real" dial. Dials without a follow-up status mark
    // don't count toward the setter's stats.
    if (data.status !== undefined) {
      const { data: recent } = await context.supabase
        .from("call_logs")
        .select("id")
        .eq("lead_id", data.id)
        .eq("user_id", context.userId)
        .is("counted_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent?.id) {
        await context.supabase
          .from("call_logs")
          .update({ counted_at: new Date().toISOString() })
          .eq("id", recent.id);
      }
    }
    return { ok: true };
  });

// ---------- Appointments (calendar) ----------
const AppointmentInput = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  type: z.enum(["booking","callback"]),
  scheduled_at: z.string().datetime(),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  context: z.string().max(5000).optional().nullable(),
});

async function getZoomAccessToken() {
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
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function createZoomMeeting(input: { topic: string; start_time: string; duration: number }) {
  try {
    const token = await getZoomAccessToken();
    if (!token) return fallbackZoomUrl();
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
    if (!res.ok) return fallbackZoomUrl();
    const json = (await res.json()) as { join_url?: string };
    return json.join_url ?? fallbackZoomUrl();
  } catch {
    return fallbackZoomUrl();
  }
}

function fallbackZoomUrl() {
  const id = Math.floor(1_000_000_000 + Math.random() * 9_000_000_000).toString();
  const pwd = Math.random().toString(36).slice(2, 12);
  return `https://zoom.us/j/${id}?pwd=${pwd}`;
}

// ---------- Booking settings (slot duration) ----------
async function getSlotMinutes(): Promise<number> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as never as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: number) => { maybeSingle: () => Promise<{ data: { slot_minutes: number } | null }> } } } })
      .from("booking_settings").select("slot_minutes").eq("id", 1).maybeSingle();
    return data?.slot_minutes ?? 30;
  } catch {
    return 30;
  }
}

export const getBookingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ slot_minutes: await getSlotMinutes() }));

export const updateBookingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    slot_minutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as never as { from: (t: string) => { upsert: (r: unknown, o: { onConflict: string }) => Promise<{ error: { message: string } | null }> } })
      .from("booking_settings").upsert({ id: 1, slot_minutes: data.slot_minutes }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function sendBookingConfirmationEmail(input: {
  appointmentId: string;
  recipientEmail: string;
  leadName: string;
  scheduledAt: string;
  meetingUrl: string | null;
  durationMinutes: number;
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
        idempotencyKey: `booking-confirm-${input.appointmentId}`,
        templateData: {
          name: input.leadName,
          scheduledAt: input.scheduledAt,
          meetingUrl: input.meetingUrl,
          durationMinutes: input.durationMinutes,
        },
      }),
    });
  } catch {
    // best-effort; queue/infra may not be configured yet
  }
}

export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(AppointmentInput.parse)
  .handler(async ({ data, context }) => {
    const slotMinutes = await getSlotMinutes();
    if (data.type === "booking") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const newStart = new Date(data.scheduled_at).getTime();
      const newEnd = newStart + slotMinutes * 60_000;
      const windowStart = new Date(newStart - slotMinutes * 60_000 + 1).toISOString();
      const windowEnd = new Date(newEnd - 1).toISOString();
      const { data: nearby } = await supabaseAdmin.from("appointments")
        .select("scheduled_at")
        .eq("type", "booking")
        .gte("scheduled_at", windowStart)
        .lte("scheduled_at", windowEnd);
      const clash = (nearby ?? []).some((row) => {
        const t = new Date(row.scheduled_at).getTime();
        return t < newEnd && t + slotMinutes * 60_000 > newStart;
      });
      if (clash) throw new Error("That time slot was just taken. Please pick another.");
    }
    let meeting_url: string | null = null;
    if (data.type === "booking") {
      meeting_url = await createZoomMeeting({
        topic: data.name,
        start_time: data.scheduled_at,
        duration: slotMinutes,
      });
    }
    const { error, data: row } = await context.supabase.from("appointments")
      .insert({ ...data, user_id: context.userId, meeting_url }).select().single();
    if (error) throw new Error(error.message);

    if (data.type === "booking" && data.email && row) {
      void sendBookingConfirmationEmail({
        appointmentId: row.id,
        recipientEmail: data.email,
        leadName: data.name,
        scheduledAt: data.scheduled_at,
        meetingUrl: meeting_url,
        durationMinutes: slotMinutes,
      });
    }
    return row;
  });

// ---------- Availability (admin Calendly-style) ----------
const AvailabilityRule = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int().min(1).max(1440),
});

export const listAvailabilityRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as never as { from: (t: string) => { select: (c: string) => { order: (col: string) => Promise<{ data: Array<{ id: string; day_of_week: number; start_minute: number; end_minute: number }> | null; error: { message: string } | null }> } } }).from("availability_rules").select("id, day_of_week, start_minute, end_minute").order("day_of_week");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const replaceAvailabilityRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ rules: z.array(AvailabilityRule).max(100) }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = (supabaseAdmin as never as { from: (t: string) => { delete: () => { neq: (c: string, v: string) => Promise<{ error: { message: string } | null }> }; insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }> } }).from("availability_rules");
    const del = await table.delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (del.error) throw new Error(del.error.message);
    if (data.rules.length > 0) {
      const ins = await table.insert(data.rules);
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true };
  });

// Helpers for timezone math
const EST_TZ = "America/New_York";
function zonedDateKey(d: Date, tz: string) {
  // en-CA gives yyyy-mm-dd
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(d);
}
function zonedDayOfWeek(d: Date, tz: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(name);
}
// Convert a wall-clock date (year/month/day/hour/min) in `tz` to a UTC Date instant.
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

export const listAvailableSlots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data }) => {
    const viewerTz = data.tz || EST_TZ;
    const [vy, vm, vd] = data.date.split("-").map(Number);

    // Determine the UTC window covering the viewer's selected date.
    const viewerDayStart = zonedWallToUTC(vy, vm, vd, 0, 0, viewerTz);
    const viewerDayEnd = zonedWallToUTC(vy, vm, vd + 1, 0, 0, viewerTz);

    // The viewer's day can span up to 2 EST calendar days. Iterate both.
    const estDates = new Set<string>();
    estDates.add(zonedDateKey(viewerDayStart, EST_TZ));
    estDates.add(zonedDateKey(new Date(viewerDayEnd.getTime() - 1), EST_TZ));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch all rules once (small table)
    const { data: allRules } = await (supabaseAdmin as never as { from: (t: string) => { select: (c: string) => Promise<{ data: Array<{ day_of_week: number; start_minute: number; end_minute: number }> | null }> } })
      .from("availability_rules").select("day_of_week, start_minute, end_minute");

    const slotMinutes = await getSlotMinutes();
    const { data: bookings } = await supabaseAdmin.from("appointments")
      .select("scheduled_at")
      .eq("type", "booking")
      .gte("scheduled_at", new Date(viewerDayStart.getTime() - slotMinutes * 60_000).toISOString())
      .lt("scheduled_at", new Date(viewerDayEnd.getTime() + slotMinutes * 60_000).toISOString());

    const takenRanges = (bookings ?? []).map((b) => {
      const start = new Date(b.scheduled_at).getTime();
      return [start, start + slotMinutes * 60_000] as const;
    });
    const overlapsTaken = (start: number, end: number) =>
      takenRanges.some(([s, e]) => s < end && e > start);
    const now = Date.now();
    const slots: string[] = [];

    for (const estDateKey of estDates) {
      const [ey, em, ed] = estDateKey.split("-").map(Number);
      const probe = zonedWallToUTC(ey, em, ed, 12, 0, EST_TZ);
      const dow = zonedDayOfWeek(probe, EST_TZ);
      const rules = (allRules ?? []).filter((r) => r.day_of_week === dow);

      for (const r of rules) {
        for (let mm = r.start_minute; mm + slotMinutes <= r.end_minute; mm += slotMinutes) {
          const slot = zonedWallToUTC(ey, em, ed, Math.floor(mm / 60), mm % 60, EST_TZ);
          const t = slot.getTime();
          if (t < now) continue;
          if (t < viewerDayStart.getTime() || t >= viewerDayEnd.getTime()) continue;
          if (overlapsTaken(t, t + slotMinutes * 60_000)) continue;
          slots.push(slot.toISOString());
        }
      }
    }
    slots.sort();
    return Array.from(new Set(slots));
  });

export const listMyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("appointments")
      .select("*").eq("user_id", context.userId).order("scheduled_at", { ascending: true });
    return data ?? [];
  });

export const listAllAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("appointments")
      .select("*").order("scheduled_at", { ascending: true });
    return data ?? [];
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), scheduled_at: z.string().datetime() }).parse)
  .handler(async ({ data, context }) => {
    const { data: appt, error: aerr } = await context.supabase
      .from("appointments").select("id, type").eq("id", data.id).single();
    if (aerr || !appt) throw new Error(aerr?.message || "Appointment not found");
    if (appt.type === "booking") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: clash } = await supabaseAdmin.from("appointments")
        .select("id").eq("type", "booking").eq("scheduled_at", data.scheduled_at).neq("id", data.id).limit(1);
      if ((clash ?? []).length > 0) throw new Error("That time slot was just taken. Please pick another.");
    }
    const { error } = await context.supabase.from("appointments")
      .update({ scheduled_at: data.scheduled_at, status: "scheduled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: appt } = await context.supabase
      .from("appointments").select("id, lead_id").eq("id", data.id).single();
    if (appt?.lead_id) {
      await context.supabase.from("leads")
        .update({ status: "Not Interested" }).eq("id", appt.lead_id);
    }
    const { error } = await context.supabase.from("appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAppointmentOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.discriminatedUnion("outcome", [
      z.object({
        id: z.string().uuid(),
        outcome: z.literal("closed"),
        deal_amount: z.number().nonnegative().max(100000000),
        commission_amount: z.number().nonnegative().max(100000000),
      }),
      z.object({
        id: z.string().uuid(),
        outcome: z.literal("lost"),
        lost_reason: z.string().trim().max(2000).optional().default(""),
      }),
      z.object({ id: z.string().uuid(), outcome: z.literal("no_show") }),
      z.object({ id: z.string().uuid(), outcome: z.literal("clear") }),
    ]).parse
  )
  .handler(async ({ data, context }) => {
    // Admin only
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { data: appt, error: aerr } = await context.supabase
      .from("appointments").select("id, user_id, type, name").eq("id", data.id).single();
    if (aerr || !appt) throw new Error(aerr?.message || "Appointment not found");
    if (appt.type !== "booking") throw new Error("Outcome only applies to bookings");

    if (data.outcome === "clear") {
      const { error } = await context.supabase.from("appointments").update({
        outcome: null, deal_amount: null, commission_amount: null, lost_reason: null,
        outcome_set_at: null, outcome_set_by: null,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      await context.supabase.from("commissions").delete().eq("appointment_id", data.id);
      return { ok: true };
    }

    if (data.outcome === "closed") {
      const { error } = await context.supabase.from("appointments").update({
        outcome: "closed",
        deal_amount: data.deal_amount,
        commission_amount: data.commission_amount,
        lost_reason: null,
        outcome_set_at: new Date().toISOString(),
        outcome_set_by: context.userId,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);

      // Upsert commission tied to this appointment
      const { data: existing } = await context.supabase
        .from("commissions").select("id").eq("appointment_id", data.id).maybeSingle();
      const note = `Closed deal: ${appt.name} ($${data.deal_amount.toFixed(2)})`;
      if (existing) {
        const { error: uerr } = await context.supabase.from("commissions")
          .update({ amount: data.commission_amount, note, added_by: context.userId, user_id: appt.user_id })
          .eq("id", existing.id);
        if (uerr) throw new Error(uerr.message);
      } else {
        const { error: ierr } = await context.supabase.from("commissions").insert({
          user_id: appt.user_id,
          amount: data.commission_amount,
          note,
          added_by: context.userId,
          appointment_id: data.id,
        });
        if (ierr) throw new Error(ierr.message);
      }
      return { ok: true };
    }

    if (data.outcome === "no_show") {
      const { error } = await context.supabase.from("appointments").update({
        outcome: "no_show",
        deal_amount: null,
        commission_amount: null,
        lost_reason: null,
        outcome_set_at: new Date().toISOString(),
        outcome_set_by: context.userId,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      await context.supabase.from("commissions").delete().eq("appointment_id", data.id);
      return { ok: true };
    }

    // lost
    const { error } = await context.supabase.from("appointments").update({
      outcome: "lost",
      deal_amount: null,
      commission_amount: null,
      lost_reason: data.lost_reason || null,
      outcome_set_at: new Date().toISOString(),
      outcome_set_by: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("commissions").delete().eq("appointment_id", data.id);
    return { ok: true };
  });

// Admin leads
export const listAllLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("leads").select("*").order("created_at", { ascending: false });
    return data ?? [];
  });

const LeadInput = z.object({
  assigned_user_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
  status: LeadStatus.default("New"),
  notes: z.string().max(5000).optional().nullable(),
});
export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(LeadInput.parse)
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase.from("leads").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });
export const adminUpdateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(LeadInput.extend({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("leads").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkDeleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });


// ---------- Commissions ----------
export const listMyCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("commissions").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false });
    return data ?? [];
  });

export const addCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    user_id: z.string().uuid(),
    amount: z.number().min(0).max(1_000_000),
    note: z.string().max(2000).optional().nullable(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase.from("commissions")
      .insert({ ...data, added_by: context.userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });
export const deleteCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("commissions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCommissionPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.union([
      z.object({
        id: z.string().uuid(),
        paid: z.literal(true),
        paid_at: z.string().min(1),
        paid_method: z.string().trim().min(1).max(100),
      }),
      z.object({ id: z.string().uuid(), paid: z.literal(false) }),
    ]).parse
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");

    if (data.paid) {
      const iso = new Date(data.paid_at).toISOString();
      const { error } = await context.supabase.from("commissions").update({
        paid_at: iso, paid_method: data.paid_method, paid_by: context.userId,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("commissions").update({
        paid_at: null, paid_method: null, paid_by: null,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Client dashboard ----------
export const getClientDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayISO = todayStart.toISOString();

    const [leadsRes, contactedTodayRes, modulesRes, completionsRes, commissionsRes] = await Promise.all([
      supabase.from("leads").select("id, status, contacted_at, created_at").eq("assigned_user_id", userId),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("assigned_user_id", userId).gte("contacted_at", todayISO),
      supabase.from("modules").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("module_completions").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("commissions").select("amount").eq("user_id", userId),
    ]);

    const leads = leadsRes.data ?? [];
    const todayLeads = leads.filter((l) => new Date(l.created_at) >= todayStart).length;
    const remaining = leads.filter((l) => l.status === "New" || !l.contacted_at).length;
    const totalModules = modulesRes.count ?? 0;
    const doneModules = completionsRes.count ?? 0;
    const progress = totalModules ? Math.round((doneModules / totalModules) * 100) : 0;
    const balance = (commissionsRes.data ?? []).reduce((s, c) => s + Number(c.amount), 0);

    return {
      todayLeads,
      contactedToday: contactedTodayRes.count ?? 0,
      remaining,
      totalLeads: leads.length,
      progress,
      doneModules,
      totalModules,
      balance,
    };
  });

// ---------- Admin dashboard ----------
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const nowISO = new Date().toISOString();
    const todayStartISO = todayStart.toISOString();
    const todayEndISO = todayEnd.toISOString();

    const [clients, leads, contactedToday, commissions, callsBookedToday, callsGoingLiveToday, upcomingCalls] = await Promise.all([
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "client"),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("contacted_at", todayStartISO),
      supabase.from("commissions").select("amount"),
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("type", "booking").gte("created_at", todayStartISO).lt("created_at", todayEndISO),
      supabase.from("appointments").select("*")
        .eq("type", "booking").gte("scheduled_at", todayStartISO).lt("scheduled_at", todayEndISO)
        .order("scheduled_at", { ascending: true }),
      supabase.from("appointments").select("*")
        .eq("type", "booking").gte("scheduled_at", nowISO)
        .order("scheduled_at", { ascending: true }).limit(25),
    ]);
    return {
      totalClients: clients.count ?? 0,
      totalLeads: leads.count ?? 0,
      contactedToday: contactedToday.count ?? 0,
      totalCommissions: (commissions.data ?? []).reduce((s, c) => s + Number(c.amount), 0),
      callsBookedToday: callsBookedToday.count ?? 0,
      callsGoingLiveToday: callsGoingLiveToday.data ?? [],
      upcomingCalls: upcomingCalls.data ?? [],
    };
  });

// ---------- Admin clients ----------
export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: clientRoles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    const ids = (clientRoles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", ids);
    return profiles ?? [];
  });

export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    user_id: z.string().uuid(),
    range: z.enum(["day", "week", "month", "90d", "all"]).default("all"),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [profile, leads, completions, attempts, commissions, totalModules, appointments, calls] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", data.user_id).maybeSingle(),
      supabase.from("leads").select("*").eq("assigned_user_id", data.user_id).order("created_at", { ascending: false }),
      supabase.from("module_completions").select("*").eq("user_id", data.user_id),
      supabase.from("quiz_attempts").select("*, modules(title)").eq("user_id", data.user_id).order("completed_at", { ascending: false }),
      supabase.from("commissions").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }),
      supabase.from("modules").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("appointments").select("*").eq("user_id", data.user_id).order("scheduled_at", { ascending: false }),
      supabase.from("call_logs")
        .select("id, lead_id, started_at, created_at, ended_at, duration_sec, status, direction, to_number, from_number, recording_url, transcript, transcript_status, summary, counted_at, leads:lead_id(name, company)")
        .eq("user_id", data.user_id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const commRows = commissions.data ?? [];
    const balance = commRows.reduce((s, c) => s + Number(c.amount), 0);
    const paid = commRows.filter((c) => c.paid_at).reduce((s, c) => s + Number(c.amount), 0);
    const unpaid = balance - paid;
    const appts = appointments.data ?? [];
    const allLeads = leads.data ?? [];
    const allCalls = calls.data ?? [];

    const days = data.range === "day" ? 1 : data.range === "week" ? 7 : data.range === "month" ? 30 : data.range === "90d" ? 90 : null;
    const cutoff = days ? Date.now() - days * 86400_000 : null;
    const inRange = <T extends Record<string, unknown>>(arr: T[], key: string) =>
      cutoff == null ? arr : arr.filter((r) => {
        const v = r[key];
        return typeof v === "string" && new Date(v).getTime() >= cutoff;
      });

    const bookings = inRange(appts.filter((a) => a.type === "booking"), "scheduled_at");
    const leadsInRange = inRange(allLeads, "created_at");
    const callsInRange = inRange(allCalls as Record<string, unknown>[], "started_at");

    return {
      profile: profile.data,
      leads: allLeads,
      completions: completions.data ?? [],
      attempts: attempts.data ?? [],
      commissions: commRows,
      totalModules: totalModules.count ?? 0,
      balance,
      paid,
      unpaid,
      appointments: appts,
      calls: allCalls,
      stats: {
        bookings: bookings.length,
        closed: bookings.filter((a) => a.outcome === "closed").length,
        lost: bookings.filter((a) => a.outcome === "lost").length,
        pending: bookings.filter((a) => !a.outcome).length,
        leadsCount: leadsInRange.length,
        dials: callsInRange.length,
      },
    };
  });


// ---------- Admin: invite client ----------
export const DEFAULT_CLIENT_PASSWORD = "ConversionLab1095!";

export const inviteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    email: z.string().email().max(200),
    full_name: z.string().min(1).max(120),
    company_name: z.string().max(120).optional().nullable(),
  }).parse)
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Admin only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create the auth user with default password (email auto-confirmed)
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: DEFAULT_CLIENT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        company_name: data.company_name ?? "",
      },
    });
    if (error) throw new Error(error.message);
    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("Failed to create user");

    // Ensure profile reflects provided fields (trigger may have created it) and force password change
    await supabaseAdmin.from("profiles").update({
      full_name: data.full_name,
      company_name: data.company_name ?? "",
      must_change_password: true,
    }).eq("user_id", newUserId);

    // Seed the new setter's account with leads from the unassigned pool
    // up to their daily quota (default 75) so they have work waiting on first sign-in.
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("daily_lead_quota")
        .eq("user_id", newUserId)
        .maybeSingle();
      const quota = Math.max(0, Math.min(500, ((prof as { daily_lead_quota?: number } | null)?.daily_lead_quota ?? 75) | 0));
      if (quota > 0) {
        const { data: pool } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("status", "New")
          .eq("retired", false)
          .eq("do_not_contact", false)
          .is("assigned_user_id", null)
          .order("created_at", { ascending: true })
          .limit(quota);
        const ids = (pool ?? []).map((r) => r.id as string);
        if (ids.length > 0) {
          await supabaseAdmin.from("leads").update({ assigned_user_id: newUserId }).in("id", ids);
        }
      }
    } catch (e) {
      console.error("Failed to seed leads for new setter", e);
    }


    // Send branded invite email with sign-in link and credentials
    try {
      const { sendTransactional } = await import("@/lib/email/transactional.server");
      await sendTransactional({
        templateName: "setter-invite",
        recipientEmail: data.email,
        idempotencyKey: `setter-invite-${newUserId}-${Date.now()}`,
        templateData: {
          fullName: data.full_name,
          email: data.email,
          password: DEFAULT_CLIENT_PASSWORD,
          loginUrl: "https://conversionlab.space/app/auth",
        },
      });
    } catch (e) {
      console.error("Failed to send setter invite email", e);
    }

    return {
      ok: true,
      email: data.email,
      default_password: DEFAULT_CLIENT_PASSWORD,
    };
  });

// ---------- Admin: resend setter invite ----------
export const resendClientInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Admin only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, email, must_change_password")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile?.email) throw new Error("Setter not found");

    // Reset password to default and require change so the emailed credentials work
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: DEFAULT_CLIENT_PASSWORD,
    });
    await supabaseAdmin.from("profiles")
      .update({ must_change_password: true })
      .eq("user_id", data.user_id);

    const { sendTransactional } = await import("@/lib/email/transactional.server");
    const result = await sendTransactional({
      templateName: "setter-invite",
      recipientEmail: profile.email,
      idempotencyKey: `setter-invite-resend-${data.user_id}-${Date.now()}`,
      templateData: {
        fullName: profile.full_name ?? "",
        email: profile.email,
        password: DEFAULT_CLIENT_PASSWORD,
        loginUrl: "https://conversionlab.space/app/auth",
      },
    });
    if (!result.ok) throw new Error(`Failed to send invite (${result.reason ?? "unknown"})`);
    return { ok: true, email: profile.email };
  });

// ---------- Admin: list admins ----------
export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminRoles, error } = await supabaseAdmin
      .from("user_roles").select("user_id, created_at").eq("role", "admin");
    if (error) throw new Error(error.message);
    const ids = (adminRoles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("user_id, full_name, email").in("user_id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    return (adminRoles ?? []).map((r) => {
      const p = byId.get(r.user_id);
      return {
        user_id: r.user_id,
        full_name: p?.full_name ?? "",
        email: p?.email ?? "",
        created_at: r.created_at,
        is_self: r.user_id === context.userId,
      };
    });
  });

// ---------- Admin: invite admin ----------
export const inviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    email: z.string().email().max(200),
    full_name: z.string().min(1).max(120),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if a user with this email already exists in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles").select("user_id").ilike("email", data.email).maybeSingle();

    let targetUserId: string;

    if (existingProfile?.user_id) {
      targetUserId = existingProfile.user_id;
      // Reset password so emailed credentials work
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: DEFAULT_CLIENT_PASSWORD,
      });
      await supabaseAdmin.from("profiles")
        .update({ must_change_password: true, full_name: data.full_name })
        .eq("user_id", targetUserId);
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: DEFAULT_CLIENT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (error) throw new Error(error.message);
      const newUserId = created.user?.id;
      if (!newUserId) throw new Error("Failed to create user");
      targetUserId = newUserId;
      await supabaseAdmin.from("profiles").update({
        full_name: data.full_name,
        must_change_password: true,
      }).eq("user_id", targetUserId);
    }

    // Grant admin role (idempotent via unique (user_id, role))
    await supabaseAdmin.from("user_roles")
      .upsert({ user_id: targetUserId, role: "admin" }, { onConflict: "user_id,role" });

    try {
      const { sendTransactional } = await import("@/lib/email/transactional.server");
      await sendTransactional({
        templateName: "admin-invite",
        recipientEmail: data.email,
        idempotencyKey: `admin-invite-${targetUserId}-${Date.now()}`,
        templateData: {
          fullName: data.full_name,
          email: data.email,
          password: DEFAULT_CLIENT_PASSWORD,
          loginUrl: "https://conversionlab.space/app/auth",
        },
      });
    } catch (e) {
      console.error("Failed to send admin invite email", e);
    }

    return {
      ok: true,
      email: data.email,
      default_password: DEFAULT_CLIENT_PASSWORD,
    };
  });

// ---------- Admin: resend admin invite ----------
export const resendAdminInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles").select("user_id, full_name, email").eq("user_id", data.user_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile?.email) throw new Error("Admin not found");

    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: DEFAULT_CLIENT_PASSWORD,
    });
    await supabaseAdmin.from("profiles")
      .update({ must_change_password: true })
      .eq("user_id", data.user_id);

    const { sendTransactional } = await import("@/lib/email/transactional.server");
    const result = await sendTransactional({
      templateName: "admin-invite",
      recipientEmail: profile.email,
      idempotencyKey: `admin-invite-resend-${data.user_id}-${Date.now()}`,
      templateData: {
        fullName: profile.full_name ?? "",
        email: profile.email,
        password: DEFAULT_CLIENT_PASSWORD,
        loginUrl: "https://conversionlab.space/app/auth",
      },
    });
    if (!result.ok) throw new Error(`Failed to send invite (${result.reason ?? "unknown"})`);
    return { ok: true, email: profile.email };
  });

// ---------- Admin: revoke admin ----------
export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Admin only");
    if (data.user_id === context.userId) throw new Error("You cannot revoke your own admin access");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) throw new Error("Cannot revoke the last remaining admin");

    const { error } = await supabaseAdmin.from("user_roles")
      .delete().eq("user_id", data.user_id).eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });



export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    new_password: z.string().min(8).max(200),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);
    // Clear the first-login flag
    await supabaseAdmin.from("profiles")
      .update({ must_change_password: false })
      .eq("user_id", context.userId);
    return { ok: true };
  });

// ---------- Admin: reorder modules ----------
export const reorderModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    order: z.array(z.object({ id: z.string().uuid(), order_index: z.number().int() })).max(500),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Two-pass to avoid unique collisions if any. Bump first into negative space, then set final.
    for (const item of data.order) {
      const { error } = await supabaseAdmin.from("modules").update({ order_index: -1000 - item.order_index }).eq("id", item.id);
      if (error) throw new Error(error.message);
    }
    for (const item of data.order) {
      const { error } = await supabaseAdmin.from("modules").update({ order_index: item.order_index }).eq("id", item.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Admin: generate quiz questions from transcript ----------
export const generateQuizFromTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    module_id: z.string().uuid(),
    transcript: z.string().min(50).max(100_000),
    count: z.number().int().min(1).max(15).default(5),
    replace: z.boolean().default(false),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const system = `You generate multiple-choice quiz questions from training transcripts. Output ONLY valid JSON matching this schema: {"questions":[{"question_text":string,"options":[string,string,string,string],"correct_answer":number}]}. correct_answer is the 0-based index into options. Make questions clear, test understanding (not trivia), and ensure exactly one correct option per question.`;
    const user = `Generate ${data.count} multiple-choice questions (4 options each) from this transcript:\n\n${data.transcript}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { questions?: Array<{ question_text: string; options: string[]; correct_answer: number }> };
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }
    const questions = (parsed.questions ?? []).filter((q) =>
      q && typeof q.question_text === "string" && Array.isArray(q.options) && q.options.length >= 2 &&
      typeof q.correct_answer === "number" && q.correct_answer >= 0 && q.correct_answer < q.options.length
    );
    if (questions.length === 0) throw new Error("AI returned no usable questions");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.replace) {
      const { error: delErr } = await supabaseAdmin.from("quiz_questions").delete().eq("module_id", data.module_id);
      if (delErr) throw new Error(delErr.message);
    }
    const rows = questions.map((q) => ({
      module_id: data.module_id,
      question_text: q.question_text.slice(0, 500),
      options: q.options.slice(0, 6).map((o) => String(o).slice(0, 300)),
      correct_answer: q.correct_answer,
    }));
    const { error } = await supabaseAdmin.from("quiz_questions").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

// ---------- Account deletion (App Store compliance 5.1.1(v)) ----------
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    // Best-effort cleanup of owned/user-scoped rows. Auth user deletion cascades
    // any FK with on delete cascade; other rows are removed explicitly here.
    await supabaseAdmin.from("module_completions").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
