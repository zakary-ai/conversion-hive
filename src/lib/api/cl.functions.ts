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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile }, { data: roles }, { data: dm }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.from("dm_setters").select("id, full_name, apply_slug, is_manager, manager_id, daily_target").eq("user_id", userId).maybeSingle(),
    ]);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    return {
      userId,
      profile,
      mustChangePassword: !!profile?.must_change_password,
      isAdmin: roleSet.has("admin"),
      isClient: roleSet.has("b2b_setter"),
      isCloser: roleSet.has("closer"),
      isDmSetter: roleSet.has("dm_setter"),
      isDmSetterManager: roleSet.has("dm_setter_manager"),
      dmSetter: dm ?? null,
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
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(50).nullable().optional().or(z.literal("").transform(() => null)),
    company: z.string().trim().max(200).nullable().optional().or(z.literal("").transform(() => null)),
  }).parse)
  .handler(async ({ data, context }) => {
    const patch: Database["public"]["Tables"]["leads"]["Update"] = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.do_not_contact !== undefined) patch.do_not_contact = data.do_not_contact;
    if (data.callback_at !== undefined) patch.callback_at = data.callback_at;
    if (data.email !== undefined) patch.email = data.email;
    if (data.name !== undefined) patch.name = data.name;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.company !== undefined) patch.company = data.company;
    if (data.contacted === true) patch.contacted_at = new Date().toISOString();
    if (data.contacted === false) patch.contacted_at = null;
    // A lead becomes "contacted" only once an outcome is recorded.
    if (data.status !== undefined && data.status !== "New" && patch.contacted_at === undefined) {
      patch.contacted_at = new Date().toISOString();
    }
    if (data.status === "New" && patch.contacted_at === undefined) {
      patch.contacted_at = null;
    }
    const { error } = await context.supabase.from("leads").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);


    // Every outcome counts as a dial. If a real call log exists for this lead
    // that hasn't been counted yet, mark it counted. Otherwise insert a
    // synthetic "manual_outcome" row so the dial still counts — those rows
    // are flagged in the UI as outcomes without an attached call.
    if (data.status !== undefined && data.status !== "New") {
      const { data: existingCounted } = await context.supabase
        .from("call_logs")
        .select("id")
        .eq("lead_id", data.id)
        .eq("user_id", context.userId)
        .not("counted_at", "is", null)
        .limit(1)
        .maybeSingle();
      if (!existingCounted?.id) {
        const { data: recent } = await context.supabase
          .from("call_logs")
          .select("id")
          .eq("lead_id", data.id)
          .eq("user_id", context.userId)
          .is("counted_at", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nowIso = new Date().toISOString();
        if (recent?.id) {
          await context.supabase
            .from("call_logs")
            .update({ counted_at: nowIso })
            .eq("id", recent.id);
        } else {
          const { data: leadRow } = await context.supabase
            .from("leads")
            .select("phone")
            .eq("id", data.id)
            .maybeSingle();
          await context.supabase.from("call_logs").insert({
            user_id: context.userId,
            lead_id: data.id,
            direction: "outgoing",
            status: "manual_outcome",
            to_number: leadRow?.phone ?? null,
            started_at: nowIso,
            counted_at: nowIso,
          });
        }
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
  timezone: z.string().max(60).optional().nullable(),
});

// ---------- Per-closer Zoom (B2B routing) ----------
async function getCloserZoomAccessToken(creds: {
  accountId: string | null;
  clientId: string | null;
  clientSecret: string | null;
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

async function createZoomMeetingOnCloserAccount(input: {
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

// ---------- B2B booking settings ----------
async function getB2bSettingsRow(): Promise<{ slot_minutes: number; days_out: number }> {
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

async function getSlotMinutes(): Promise<number> {
  const s = await getB2bSettingsRow();
  return s.slot_minutes;
}

export const getB2bSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => getB2bSettingsRow());

export const updateB2bSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    slot_minutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]),
    days_out: z.number().int().min(1).max(180),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("b2b_settings") as any)
      .upsert({ id: 1, slot_minutes: data.slot_minutes, days_out: data.days_out, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });




const APP_ORIGIN = "https://conversionlab.space";

function formatScheduledLabel(scheduledAt: string, tz: string | null | undefined): string {
  const effectiveTz = tz && tz.trim() ? tz : "America/New_York";
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

function generateConfirmationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendBookingReceivedEmail(input: {
  appointmentId: string;
  recipientEmail: string;
  leadName: string;
  scheduledAt: string;
  timezone: string | null;
  durationMinutes: number;
}) {
  try {
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    const scheduledLabel = formatScheduledLabel(input.scheduledAt, input.timezone);
    await sendTransactional({
      templateName: "booking-received",
      recipientEmail: input.recipientEmail,
      idempotencyKey: `booking-received-${input.appointmentId}`,
      templateData: {
        name: input.leadName,
        scheduledAt: input.scheduledAt,
        scheduledLabel,
        durationMinutes: input.durationMinutes,
      },
    });
  } catch (e) {
    console.warn("[booking-received] send failed", e);
  }
}

async function sendBookingConfirmationEmail(input: {
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

    // Mint (or reuse) a confirmation token for this appointment.
    let confirmationToken: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabaseAdmin.from("appointments") as any)
      .select("confirmation_token, timezone")
      .eq("id", input.appointmentId)
      .maybeSingle();
    confirmationToken = (existing?.confirmation_token as string | null) ?? null;
    const storedTz = (existing?.timezone as string | null) ?? null;
    if (!confirmationToken) {
      confirmationToken = generateConfirmationToken();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("appointments") as any)
        .update({ confirmation_token: confirmationToken })
        .eq("id", input.appointmentId);
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

// B2B bookings created by setters land as pending_assignment.
// Zoom + lead email happen when an admin assigns a closer.
export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(AppointmentInput.parse)
  .handler(async ({ data, context }) => {
    if (data.type === "booking") {
      // Light collision check at exact slot to avoid duplicate setter taps.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: same } = await supabaseAdmin.from("appointments")
        .select("id")
        .eq("type", "booking")
        .eq("scheduled_at", data.scheduled_at)
        .eq("user_id", context.userId);
      if ((same ?? []).length > 0) {
        throw new Error("You already booked this slot. Pick another time.");
      }
    }
    const status = data.type === "booking" ? "pending_assignment" : "scheduled";
    const { error, data: row } = await context.supabase.from("appointments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ ...data, user_id: context.userId, status, meeting_url: null } as any).select().single();
    if (error) throw new Error(error.message);

    // Fire "booking received" email as soon as the setter books a B2B call.
    // The Zoom link comes later when an admin assigns a closer.
    if (data.type === "booking" && data.email) {
      const slotMinutes = await getSlotMinutes().catch(() => 30);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sendBookingReceivedEmail({
        appointmentId: (row as any).id as string,
        recipientEmail: data.email,
        leadName: data.name,
        scheduledAt: data.scheduled_at,
        timezone: data.timezone ?? null,
        durationMinutes: slotMinutes,
      });
    }

    return row;
  });

// ---------- Availability (admin-managed B2B global window) ----------
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
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(d);
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

// B2B slots: a slot is offered when it falls inside the global B2B window
// (availability_rules) AND at least one active b2b closer is free at that
// time, minus any pending (unassigned) bookings already sitting on that
// exact slot. Per-closer weekly rules are intentionally not consulted —
// the master B2B window is the single source of truth for when the team
// can be booked.
export const listAvailableSlots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data }) => {
    const viewerTz = data.tz || EST_TZ;
    const [vy, vm, vd] = data.date.split("-").map(Number);
    const viewerDayStart = zonedWallToUTC(vy, vm, vd, 0, 0, viewerTz);
    const viewerDayEnd = zonedWallToUTC(vy, vm, vd + 1, 0, 0, viewerTz);

    const { slot_minutes: SLOT, days_out } = await getB2bSettingsRow();
    if (viewerDayStart.getTime() > Date.now() + days_out * 24 * 60 * 60 * 1000) return [] as string[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Global B2B window
    const { data: globalRules } = await (supabaseAdmin as never as { from: (t: string) => { select: (c: string) => Promise<{ data: Array<{ day_of_week: number; start_minute: number; end_minute: number }> | null }> } })
      .from("availability_rules").select("day_of_week, start_minute, end_minute");

    if (!globalRules || globalRules.length === 0) return [] as string[];

    // B2B closers (active pool). Per-closer rules are intentionally ignored.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closers } = await (supabaseAdmin.from("b2b_closers") as any)
      .select("id").eq("active", true);
    const closerIds = ((closers ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (closerIds.length === 0) return [] as string[];


    // Existing appointments overlapping the viewer window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookings } = await (supabaseAdmin.from("appointments") as any)
      .select("scheduled_at, b2b_closer_id, status")
      .eq("type", "booking")
      .gte("scheduled_at", new Date(viewerDayStart.getTime() - SLOT * 60_000).toISOString())
      .lt("scheduled_at", new Date(viewerDayEnd.getTime() + SLOT * 60_000).toISOString());
    const allBookings = (bookings ?? []) as Array<{ scheduled_at: string; b2b_closer_id: string | null; status: string | null }>;

    // Viewer day can span 2 EST calendar days
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
      const globalWindows = globalRules.filter((r) => r.day_of_week === dow);
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
            const conflict = allBookings.some((b) => {
              if (b.b2b_closer_id !== cid) return false;
              if (b.status === "cancelled") return false;
              const bs = new Date(b.scheduled_at).getTime();
              return bs < slotEnd && bs + slotMs > t;
            });
            if (!conflict) availableClosers += 1;
          }

          // Reserve capacity for pending (unassigned) bookings already sitting on this slot
          const pendingAtSlot = allBookings.filter((b) =>
            b.b2b_closer_id == null
            && b.status === "pending_assignment"
            && new Date(b.scheduled_at).getTime() === t
          ).length;

          if (availableClosers - pendingAtSlot > 0) {
            found.add(slot.toISOString());
          }
        }
      }
    }

    return Array.from(found).sort();
  });


export const listMyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: closerRows }, { data: b2bCloserRows }] = await Promise.all([
      context.supabase.from("closers").select("id").eq("user_id", context.userId),
      context.supabase.from("b2b_closers").select("id").eq("user_id", context.userId),
    ]);

    const closerIds = (closerRows ?? []).map((r) => r.id);
    const b2bCloserIds = ((b2bCloserRows ?? []) as Array<{ id: string }>).map((r) => r.id);
    const filters = [`user_id.eq.${context.userId}`];
    if (closerIds.length > 0) filters.push(`assigned_closer_id.in.(${closerIds.join(",")})`);
    if (b2bCloserIds.length > 0) filters.push(`b2b_closer_id.in.(${b2bCloserIds.join(",")})`);

    const { data, error } = await context.supabase.from("appointments")
      .select("*")
      .or(filters.join(","))
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Database["public"]["Tables"]["appointments"]["Row"][];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: appt, error: aerr } = await (context.supabase.from("appointments") as any)
      .select("id, type, name, email, assigned_closer_id, b2b_closer_id, status").eq("id", data.id).single();
    if (aerr || !appt) throw new Error(aerr?.message || "Appointment not found");

    const slotMinutes = await getSlotMinutes();
    if (appt.type === "booking") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: clash } = await supabaseAdmin.from("appointments")
        .select("id, assigned_closer_id, b2b_closer_id, status")
        .eq("type", "booking")
        .eq("scheduled_at", data.scheduled_at)
        .neq("id", data.id);
      const currentCloserId = (appt.b2b_closer_id as string | null) ?? (appt.assigned_closer_id as string | null);
      const closerCol: "b2b_closer_id" | "assigned_closer_id" = appt.b2b_closer_id ? "b2b_closer_id" : "assigned_closer_id";
      if (currentCloserId) {
        const c = (clash ?? []).find((r) =>
          (r as Record<string, string | null>)[closerCol] === currentCloserId
          && (r as { status?: string | null }).status !== "cancelled"
        );
        if (c) throw new Error("That closer is already booked at this time.");
      }
    }

    let newMeetingUrl: string | null | undefined = undefined;
    const assignedCloserId = (appt.b2b_closer_id as string | null) ?? (appt.assigned_closer_id as string | null);
    if (appt.type === "booking" && assignedCloserId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const credsTable = appt.b2b_closer_id ? "b2b_closer_zoom_credentials" : "closer_zoom_credentials";
      const { data: creds } = await supabaseAdmin
        .from(credsTable)
        .select("zoom_account_id, zoom_client_id, zoom_client_secret")
        .eq("closer_id", assignedCloserId)
        .maybeSingle();
      newMeetingUrl = await createZoomMeetingOnCloserAccount({
        accountId: (creds?.zoom_account_id as string | null) ?? null,
        clientId: (creds?.zoom_client_id as string | null) ?? null,
        clientSecret: (creds?.zoom_client_secret as string | null) ?? null,
        topic: `${appt.name} — Sales Call`,
        start_time: data.scheduled_at,
        duration: slotMinutes,
      });
    }

    const patch: Record<string, unknown> = { scheduled_at: data.scheduled_at };
    if (appt.type === "booking") {
      patch.status = assignedCloserId ? "assigned" : "pending_assignment";
    } else {
      patch.status = "scheduled";
    }
    if (newMeetingUrl !== undefined) patch.meeting_url = newMeetingUrl;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase.from("appointments") as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (appt.type === "booking" && assignedCloserId && appt.email) {
      await sendBookingConfirmationEmail({
        appointmentId: data.id,
        recipientEmail: appt.email,
        leadName: appt.name,
        scheduledAt: data.scheduled_at,
        meetingUrl: newMeetingUrl ?? null,
        durationMinutes: slotMinutes,
        idempotencySuffix: `reschedule-${Date.now()}`,
      });
    }
    return { ok: true };
  });

// ---------- B2B admin: assign closer, day list, cancel ----------
export const listB2bBookingsForDate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const tz = data.tz || EST_TZ;
    const [y, m, d] = data.date.split("-").map(Number);
    const start = zonedWallToUTC(y, m, d, 0, 0, tz);
    const end = zonedWallToUTC(y, m, d + 1, 0, 0, tz);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase.from("appointments") as any)
      .select("*, closers:assigned_closer_id (id, full_name, email), b2b_closer:b2b_closer_id (id, full_name, email)")
      .eq("type", "booking")
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString())
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listB2bBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase.from("appointments") as any)
      .select("*, closers:assigned_closer_id (id, full_name, email), b2b_closer:b2b_closer_id (id, full_name, email)")
      .eq("type", "booking")
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const assignB2bCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    appointment_id: z.string().uuid(),
    closer_id: z.string().uuid(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: appt, error: aerr } = await (supabaseAdmin.from("appointments") as any)
      .select("*").eq("id", data.appointment_id).single();
    if (aerr || !appt) throw new Error(aerr?.message || "Appointment not found");
    if (appt.type !== "booking") throw new Error("Only bookings can be assigned");

    // Lookup the B2B closer in the dedicated pool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closer, error: cerr } = await (supabaseAdmin.from("b2b_closers") as any)
      .select("id, full_name, email, active").eq("id", data.closer_id).single();
    if (cerr || !closer) throw new Error(cerr?.message || "B2B closer not found");
    if (!closer.active) throw new Error("That closer is not active.");

    // Same-closer conflict
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conflict } = await (supabaseAdmin.from("appointments") as any)
      .select("id")
      .eq("type", "booking")
      .eq("scheduled_at", appt.scheduled_at)
      .eq("b2b_closer_id", data.closer_id)
      .neq("id", data.appointment_id);
    if ((conflict ?? []).length > 0) throw new Error("That closer is already booked at this time.");

    const slotMinutes = await getSlotMinutes();
    const { data: creds } = await supabaseAdmin
      .from("b2b_closer_zoom_credentials")
      .select("zoom_account_id, zoom_client_id, zoom_client_secret")
      .eq("closer_id", data.closer_id)
      .maybeSingle();
    const meetingUrl = await createZoomMeetingOnCloserAccount({
      accountId: (creds?.zoom_account_id as string | null) ?? null,
      clientId: (creds?.zoom_client_id as string | null) ?? null,
      clientSecret: (creds?.zoom_client_secret as string | null) ?? null,
      topic: `${appt.name} — Sales Call`,
      start_time: appt.scheduled_at as string,
      duration: slotMinutes,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uerr } = await (supabaseAdmin.from("appointments") as any).update({
      b2b_closer_id: data.closer_id,
      assigned_closer_id: null,
      status: "assigned",
      meeting_url: meetingUrl,
    }).eq("id", data.appointment_id);
    if (uerr) throw new Error(uerr.message);

    if (appt.email) {
      await sendBookingConfirmationEmail({
        appointmentId: data.appointment_id,
        recipientEmail: appt.email as string,
        leadName: appt.name as string,
        scheduledAt: appt.scheduled_at as string,
        meetingUrl,
        durationMinutes: slotMinutes,
      });
    }

    return { ok: true, meeting_url: meetingUrl };
  });

export const unassignB2bCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ appointment_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase.from("appointments") as any).update({
      b2b_closer_id: null,
      assigned_closer_id: null,
      status: "pending_assignment",
      meeting_url: null,
    }).eq("id", data.appointment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelB2bBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ appointment_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase.from("appointments") as any).update({
      status: "cancelled",
    }).eq("id", data.appointment_id);
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
        commission_percent: z.number().nonnegative().max(100),
        commission_amount: z.number().nonnegative().max(100000000),
      }),
      z.object({
        id: z.string().uuid(),
        outcome: z.literal("lost"),
        lost_reason: z.string().trim().max(2000).optional().default(""),
      }),
      z.object({ id: z.string().uuid(), outcome: z.literal("no_show") }),
      z.object({ id: z.string().uuid(), outcome: z.literal("disqualified") }),
      z.object({ id: z.string().uuid(), outcome: z.literal("clear") }),
    ]).parse
  )
  .handler(async ({ data, context }) => {
    const { data: appt, error: aerr } = await context.supabase
      .from("appointments").select("id, user_id, type, name, lead_id, assigned_closer_id, b2b_closer_id").eq("id", data.id).single();
    if (aerr || !appt) throw new Error(aerr?.message || "Appointment not found");
    if (appt.type !== "booking") throw new Error("Outcome only applies to bookings");

    // Allow: admin, owner, assigned B2C closer, or assigned B2B closer
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    let allowed = isAdmin || appt.user_id === context.userId;
    let actingCloserUserId: string | null = isAdmin ? null : context.userId;
    if (!allowed && appt.assigned_closer_id) {
      const { data: c } = await context.supabase.from("closers").select("id").eq("id", appt.assigned_closer_id).eq("user_id", context.userId).maybeSingle();
      if (c) { allowed = true; actingCloserUserId = context.userId; }
    }
    if (!allowed && appt.b2b_closer_id) {
      const { data: bc } = await context.supabase.from("b2b_closers").select("id").eq("id", appt.b2b_closer_id).eq("user_id", context.userId).maybeSingle();
      if (bc) { allowed = true; actingCloserUserId = context.userId; }
    }
    if (!allowed) throw new Error("Forbidden");

    // Authorization done above — use admin client for commissions writes so
    // closer-inserted setter rows (user_id != auth.uid()) don't hit RLS.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Keep the linked lead's status in sync with the appointment outcome so
    // the lead profile / pipeline reflects the closer's decision immediately.
    const syncLeadStatus = async (status: string) => {
      if (!appt.lead_id) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabaseAdmin.from("leads").update({ status } as any).eq("id", appt.lead_id);
    };

    if (data.outcome === "clear") {
      const { error } = await context.supabase.from("appointments").update({
        outcome: null, deal_amount: null, commission_amount: null, lost_reason: null,
        outcome_set_at: null, outcome_set_by: null,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("commissions").delete().eq("appointment_id", data.id);
      await syncLeadStatus("Booked");
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

      // The closer commission (person who logged the outcome, or setter if admin)
      const closerUserId = actingCloserUserId ?? appt.user_id;
      const note = `Closed deal: ${appt.name} ($${data.deal_amount.toFixed(2)} @ ${data.commission_percent}%)`;

      // Upsert closer row (role='closer')
      const { data: existingCloser } = await supabaseAdmin
        .from("commissions").select("id").eq("appointment_id", data.id).eq("role", "closer").maybeSingle();
      if (existingCloser) {
        const { error: uerr } = await supabaseAdmin.from("commissions")
          .update({
            amount: data.commission_amount,
            commission_percent: data.commission_percent,
            deal_amount: data.deal_amount,
            note,
            added_by: context.userId,
            user_id: closerUserId,
          })
          .eq("id", existingCloser.id);
        if (uerr) throw new Error(uerr.message);
      } else {
        const { error: ierr } = await supabaseAdmin.from("commissions").insert({
          user_id: closerUserId,
          role: "closer",
          amount: data.commission_amount,
          commission_percent: data.commission_percent,
          deal_amount: data.deal_amount,
          status: isAdmin ? "approved" : "pending",
          approved_at: isAdmin ? new Date().toISOString() : null,
          approved_by: isAdmin ? context.userId : null,
          note,
          added_by: context.userId,
          appointment_id: data.id,
        });
        if (ierr) throw new Error(ierr.message);
      }

      // Setter commission row (role='setter') — only if setter differs from the closer
      const setterUserId = appt.user_id as string | null;
      if (setterUserId && setterUserId !== closerUserId) {
        const { data: existingSetter } = await supabaseAdmin
          .from("commissions").select("id, status, commission_percent").eq("appointment_id", data.id).eq("role", "setter").maybeSingle();
        const setterNote = `Setter for: ${appt.name} ($${data.deal_amount.toFixed(2)})`;
        if (existingSetter) {
          // Recalculate amount if setter percent already set
          const pct = existingSetter.commission_percent != null ? Number(existingSetter.commission_percent) : null;
          const patch: { deal_amount: number; note: string; amount?: number } = { deal_amount: data.deal_amount, note: setterNote };
          if (pct != null) patch.amount = Math.round(data.deal_amount * pct) / 100;
          const { error: uerr } = await supabaseAdmin.from("commissions").update(patch).eq("id", existingSetter.id);
          if (uerr) throw new Error(uerr.message);

        } else {
          const { error: ierr } = await supabaseAdmin.from("commissions").insert({
            user_id: setterUserId,
            role: "setter",
            amount: 0,
            commission_percent: null,
            deal_amount: data.deal_amount,
            status: "pending",
            note: setterNote,
            added_by: context.userId,
            appointment_id: data.id,
          });
          if (ierr) throw new Error(ierr.message);
        }
      }
      await syncLeadStatus("Closed");
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
      await supabaseAdmin.from("commissions").delete().eq("appointment_id", data.id);
      await syncLeadStatus("No Show");
      return { ok: true };
    }

    if (data.outcome === "disqualified") {
      const { error } = await context.supabase.from("appointments").update({
        outcome: "disqualified",
        deal_amount: null,
        commission_amount: null,
        lost_reason: null,
        outcome_set_at: new Date().toISOString(),
        outcome_set_by: context.userId,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("commissions").delete().eq("appointment_id", data.id);
      await syncLeadStatus("Disqualified");
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
    await supabaseAdmin.from("commissions").delete().eq("appointment_id", data.id);
    await syncLeadStatus("Lost");
    return { ok: true };
  });

// Admin leads — paginated + server-side filtered so totals can exceed 1000.
export const listAllLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      page: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(200).default(50),
      search: z.string().max(200).optional().nullable(),
      status: z.string().max(40).optional().nullable(),
      clientId: z.string().max(64).optional().nullable(),
    }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase.from("leads").select("*", { count: "exact" });
    if (data.status && data.status !== "all") q = q.eq("status", data.status as never);
    if (data.clientId && data.clientId !== "all") {
      if (data.clientId === "unassigned") q = q.is("assigned_user_id", null);
      else q = q.eq("assigned_user_id", data.clientId);
    }
    if (data.search && data.search.trim()) {
      const s = data.search.trim().replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
    }
    const { data: rows, count, error } = await q
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
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

const BulkImportInput = z.object({
  rows: z.array(LeadInput).min(1).max(5000),
});
export const bulkImportLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(BulkImportInput.parse)
  .handler(async ({ data, context }) => {
    const normPhone = (p?: string | null) => (p ?? "").replace(/\D/g, "");
    const { data: existing, error: exErr } = await context.supabase
      .from("leads")
      .select("phone")
      .not("phone", "is", null);
    if (exErr) throw new Error(exErr.message);
    const existingSet = new Set((existing ?? []).map((r) => normPhone(r.phone)).filter(Boolean));

    const toInsert: typeof data.rows = [];
    const seenInBatch = new Set<string>();
    let duplicates = 0;
    let missingPhone = 0;
    for (const r of data.rows) {
      const np = normPhone(r.phone);
      if (!np) { missingPhone++; toInsert.push(r); continue; }
      if (existingSet.has(np) || seenInBatch.has(np)) { duplicates++; continue; }
      seenInBatch.add(np);
      toInsert.push(r);
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      if (!chunk.length) continue;
      const { error } = await context.supabase.from("leads").insert(chunk);
      if (error) throw new Error(error.message);
      inserted += chunk.length;
    }
    return { inserted, duplicates, missingPhone, total: data.rows.length };
  });


export const getLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.lead_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead not found");
    const { data: calls } = await context.supabase
      .from("call_logs")
      .select("*")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    let setter: { user_id: string; full_name: string | null; email: string | null } | null = null;
    if (lead.assigned_user_id) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("user_id", lead.assigned_user_id)
        .maybeSingle();
      if (prof) setter = prof as { user_id: string; full_name: string | null; email: string | null };
    }
    return { lead, calls: calls ?? [], setter };
  });


// Returns the setter (creator) of an appointment. Accessible to admins, the setter themselves,
// and the assigned closer (b2c or b2b).
export const getAppointmentSetter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: appt } = await context.supabase
      .from("appointments")
      .select("user_id, assigned_closer_id, b2b_closer_id")
      .eq("id", data.id)
      .single();
    if (!appt) return null;

    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    let allowed = isAdmin || appt.user_id === context.userId;
    if (!allowed && appt.assigned_closer_id) {
      const { data: c } = await context.supabase.from("closers").select("id").eq("id", appt.assigned_closer_id).eq("user_id", context.userId).maybeSingle();
      if (c) allowed = true;
    }
    if (!allowed && appt.b2b_closer_id) {
      const { data: bc } = await context.supabase.from("b2b_closers").select("id").eq("id", appt.b2b_closer_id).eq("user_id", context.userId).maybeSingle();
      if (bc) allowed = true;
    }
    if (!allowed) return null;

    // Use admin client so profile RLS (own-profile-only) doesn't block the read
    // when the viewer is an assigned closer (not the setter).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("user_id", appt.user_id)
      .maybeSingle();
    return prof ? {
      user_id: prof.user_id,
      name: (prof.full_name as string | null) || (prof.email as string | null) || "Setter",
    } : null;
  });

// Admin: list all DM setters (B2C) for attaching to appointments.
export const listSetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { data: clientRoles } = await context.supabase.from("user_roles").select("user_id").eq("role", "dm_setter");
    const ids = (clientRoles ?? []).map((r: { user_id: string }) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profs } = await context.supabase
      .from("profiles").select("user_id, full_name, email").in("user_id", ids);
    return ((profs ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>)
      .map((p) => ({ user_id: p.user_id, name: (p.full_name || p.email || p.user_id.slice(0, 8)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

// Admin: reassign the setter (creator) on an appointment. Also updates any
// existing setter commission row on that appointment to the new user.
export const setAppointmentSetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");

    const { error } = await context.supabase
      .from("appointments").update({ user_id: data.user_id }).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Update setter commission row if one exists
    await context.supabase.from("commissions")
      .update({ user_id: data.user_id })
      .eq("appointment_id", data.id)
      .eq("role", "setter");
    return { ok: true };
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

export const approveCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { error } = await context.supabase.from("commissions").update({
      status: "approved", approved_at: new Date().toISOString(), approved_by: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    amount: z.number().nonnegative().max(100000000).optional(),
    commission_percent: z.number().nonnegative().max(100).nullable().optional(),
    deal_amount: z.number().nonnegative().max(100000000).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const patch: { amount?: number; commission_percent?: number | null; deal_amount?: number | null; note?: string | null } = {};
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.commission_percent !== undefined) patch.commission_percent = data.commission_percent;
    if (data.deal_amount !== undefined) patch.deal_amount = data.deal_amount;
    if (data.note !== undefined) patch.note = data.note;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("commissions").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
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
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "dm_setter"),
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

// ---------- Channel-aware admin overview (B2B/B2C) ----------
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channel: z.enum(["b2b", "b2c"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const nowISO = new Date().toISOString();
    const tsISO = todayStart.toISOString();
    const teISO = todayEnd.toISOString();

    type Row = {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      scheduled_at: string;
      meeting_url: string | null;
      context: string | null;
      // extras for outcome dialogs
      lead_id: string | null;
      application_id: string | null;
      type: string | null;
      outcome: string | null;
      deal_amount: number | string | null;
      commission_amount: number | string | null;
      lost_reason: string | null;
    };

    if (data.channel === "b2c") {
      const [scheduled, going, booked, closed, upcoming] = await Promise.all([
        supabase.from("closer_bookings").select("*").eq("status", "pending_assignment").order("slot_start", { ascending: true }),
        supabase.from("closer_bookings").select("*").in("status", ["assigned", "completed"])
          .gte("slot_start", tsISO).lt("slot_start", teISO).order("slot_start", { ascending: true }),
        supabase.from("closer_bookings").select("*")
          .gte("created_at", tsISO).lt("created_at", teISO).order("created_at", { ascending: false }),
        supabase.from("closer_bookings").select("*").in("outcome", ["closed", "deposit"])
          .gte("outcome_at", tsISO).lt("outcome_at", teISO).order("outcome_at", { ascending: false }),
        supabase.from("closer_bookings").select("*").in("status", ["pending_assignment", "assigned"])
          .gte("slot_start", nowISO).order("slot_start", { ascending: true }).limit(25),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (r: any): Row => ({
        id: r.id, name: r.applicant_name, email: r.applicant_email, phone: r.applicant_phone,
        scheduled_at: r.slot_start, meeting_url: r.zoom_join_url, context: r.notes,
        lead_id: null, application_id: r.application_id ?? null, type: "b2c_booking",
        outcome: r.outcome ?? null, deal_amount: r.deal_amount ?? null,
        commission_amount: r.commission_amount ?? null, lost_reason: null,
      });
      return {
        scheduledLeads: (scheduled.data ?? []).map(map),
        callsGoingLiveToday: (going.data ?? []).map(map),
        callsBookedToday: (booked.data ?? []).map(map),
        callsClosedToday: (closed.data ?? []).map(map),
        upcomingCalls: (upcoming.data ?? []).map(map),
      };
    }

    const [scheduled, going, booked, closed, upcoming] = await Promise.all([
      supabase.from("appointments").select("*").eq("type", "booking").eq("status", "pending_assignment")
        .order("scheduled_at", { ascending: true }),
      supabase.from("appointments").select("*").eq("type", "booking")
        .gte("scheduled_at", tsISO).lt("scheduled_at", teISO).order("scheduled_at", { ascending: true }),
      supabase.from("appointments").select("*").eq("type", "booking")
        .gte("created_at", tsISO).lt("created_at", teISO).order("created_at", { ascending: false }),
      supabase.from("appointments").select("*").eq("type", "booking").eq("outcome", "closed")
        .gte("scheduled_at", tsISO).lt("scheduled_at", teISO).order("scheduled_at", { ascending: false }),
      supabase.from("appointments").select("*").eq("type", "booking")
        .gte("scheduled_at", nowISO).order("scheduled_at", { ascending: true }).limit(25),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (r: any): Row => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone,
      scheduled_at: r.scheduled_at, meeting_url: r.meeting_url, context: r.context,
      lead_id: r.lead_id ?? null, application_id: null, type: r.type ?? "booking",
      outcome: r.outcome ?? null, deal_amount: r.deal_amount ?? null,
      commission_amount: r.commission_amount ?? null, lost_reason: r.lost_reason ?? null,
    });
    return {
      scheduledLeads: (scheduled.data ?? []).map(map),
      callsGoingLiveToday: (going.data ?? []).map(map),
      callsBookedToday: (booked.data ?? []).map(map),
      callsClosedToday: (closed.data ?? []).map(map),
      upcomingCalls: (upcoming.data ?? []).map(map),
    };
  });



// ---------- Admin clients ----------
export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: clientRoles } = await supabase.from("user_roles").select("user_id").eq("role", "b2b_setter");
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
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
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

    // Explicit from/to window overrides range preset.
    let fromMs: number | null = null;
    let toMs: number | null = null;
    if (data.from || data.to) {
      fromMs = data.from ? new Date(data.from).getTime() : null;
      toMs = data.to ? new Date(data.to).getTime() : null;
    } else {
      const days = data.range === "day" ? 1 : data.range === "week" ? 7 : data.range === "month" ? 30 : data.range === "90d" ? 90 : null;
      fromMs = days ? Date.now() - days * 86400_000 : null;
      toMs = null;
    }
    const inRange = <T extends Record<string, unknown>>(arr: T[], key: string) =>
      (fromMs == null && toMs == null) ? arr : arr.filter((r) => {
        const v = r[key];
        if (typeof v !== "string") return false;
        const t = new Date(v).getTime();
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
        return true;
      });

    const allBookings = appts.filter((a) => a.type === "booking");
    // Bookings = leads the setter BOOKED within the window (created_at)
    const bookingsBooked = inRange(allBookings, "created_at");
    // Calls in the window (by scheduled_at) — used for outcome-based stats and "going live"
    const bookingsScheduled = inRange(allBookings, "scheduled_at");
    const leadsInRange = inRange(allLeads, "created_at");
    const callsInRange = inRange(allCalls as Record<string, unknown>[], "started_at");
    // Dials = leads the setter recorded an outcome on within the window.
    // A "dial" is any lead whose status moved off "New"; we filter by
    // last_status_change_at so it matches the Today's Leads → Contacted list
    // and the Lead history list exactly.
    const dialedInRange = inRange(
      allLeads.filter((l) => l.status !== "New") as Record<string, unknown>[],
      "last_status_change_at",
    );

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
        bookings: bookingsBooked.length,
        closed: bookingsScheduled.filter((a) => a.outcome === "closed").length,
        lost: bookingsScheduled.filter((a) => a.outcome === "lost").length,
        no_show: bookingsScheduled.filter((a) => a.outcome === "no_show").length,
        pending: bookingsScheduled.filter((a) => !a.outcome).length,
        leadsCount: leadsInRange.length,
        dials: dialedInRange.length,
        callsWithArtifacts: (callsInRange as Array<{ counted_at: string | null }>).filter((c) => c.counted_at).length,
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

// ---------- Admin: delete setter ----------
export const deleteSetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Admin only");
    if (data.user_id === context.userId) throw new Error("You can't delete yourself");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Release any leads assigned to this setter back to the unassigned pool
    await supabaseAdmin.from("leads")
      .update({ assigned_user_id: null })
      .eq("assigned_user_id", data.user_id);

    // Clean up role + profile rows (auth user delete should cascade, but be explicit)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("user_id", data.user_id);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
      const email = p?.email ?? "";
      return {
        user_id: r.user_id,
        full_name: p?.full_name ?? "",
        email,
        created_at: r.created_at,
        is_self: r.user_id === context.userId,
        is_super_admin: email.toLowerCase() === "conversionlabb@gmail.com",
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
export const SUPER_ADMIN_EMAIL = "conversionlabb@gmail.com";

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Admin only");
    if (data.user_id === context.userId) throw new Error("You cannot revoke your own admin access");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Protect the super admin account — its admin status cannot be revoked.
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles").select("email").eq("user_id", data.user_id).maybeSingle();
    if (targetProfile?.email && targetProfile.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      throw new Error("The super admin account cannot be revoked");
    }

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

export const generateModuleMetaFromTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    transcript: z.string().min(50).max(100_000),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const system = `You write concise metadata for training modules. Output ONLY valid JSON matching: {"title": string, "description": string}. Title: 3-8 words, no quotes, no trailing punctuation. Description: 1-2 sentences (max ~240 chars) summarizing what the learner will take away.`;
    const user = `Transcript:\n\n${data.transcript}`;

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
    let parsed: { title?: string; description?: string };
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }
    const title = String(parsed.title ?? "").trim().slice(0, 120);
    const description = String(parsed.description ?? "").trim().slice(0, 1000);
    if (!title) throw new Error("AI returned no title");
    return { title, description };
  });

// ---------- Account deletion requests ----------
// Users request deletion; admin reviews and approves/rejects.
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ reason: z.string().trim().max(2000).optional() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("account_deletion_requests")
      .select("id")
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { ok: true, already: true };
    const { error } = await supabaseAdmin
      .from("account_deletion_requests")
      .insert({ user_id: context.userId, reason: data.reason || null });
    if (error) throw new Error(error.message);
    return { ok: true, already: false };
  });

export const getMyAccountDeletionRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("account_deletion_requests")
      .select("id, status, reason, admin_notes, created_at, resolved_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  });

export const cancelMyAccountDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("account_deletion_requests")
      .delete()
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAccountDeletionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reqs, error } = await supabaseAdmin
      .from("account_deletion_requests")
      .select("id, user_id, reason, status, admin_notes, created_at, resolved_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((reqs ?? []).map((r) => r.user_id)));
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("user_id, full_name, email").in("user_id", ids)
      : { data: [] as { user_id: string; full_name: string | null; email: string | null }[] };
    const map = new Map((profs ?? []).map((p) => [p.user_id, p]));
    return (reqs ?? []).map((r) => ({
      ...r,
      full_name: map.get(r.user_id)?.full_name ?? null,
      email: map.get(r.user_id)?.email ?? null,
    }));
  });

export const resolveAccountDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    request_id: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    admin_notes: z.string().trim().max(2000).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error: fetchErr } = await supabaseAdmin
      .from("account_deletion_requests")
      .select("id, user_id, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already resolved");

    if (data.action === "approve") {
      const userId = req.user_id;
      await supabaseAdmin.from("module_completions").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) throw new Error(delErr.message);
    }

    const { error: updErr } = await supabaseAdmin
      .from("account_deletion_requests")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        admin_notes: data.admin_notes || null,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.request_id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

// ---------- Admin: backfill OpenPhone artifacts for a setter ----------
// Iterates every call_logs row for the setter that has no openphone_call_id,
// queries OpenPhone for the matching call by destination phone + time,
// then pulls in the recording, transcript and summary.
export const backfillSetterCallArtifacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    user_id: z.string().uuid(),
    since_days: z.number().int().min(1).max(60).default(7),
  }).parse)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const key = process.env.OPENPHONE_API_KEY;
    if (!key) throw new Error("OPENPHONE_API_KEY not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const opGet = async (path: string): Promise<unknown | null> => {
      try {
        const r = await fetch(`https://api.quo.com${path}`, { headers: { Authorization: key } });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    };

    // Look up the setter's OpenPhone user id by email
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("email").eq("user_id", data.user_id).maybeSingle();
    if (!profile?.email) throw new Error("Setter has no email");
    const setterEmail = profile.email.toLowerCase();

    type OpUser = { id: string; email?: string };
    type OpPhone = { id: string; users?: OpUser[] };
    const phones = (await opGet("/v1/phone-numbers")) as { data?: OpPhone[] } | null;
    let opUserId: string | null = null;
    let phoneNumberId: string | null = null;
    for (const p of phones?.data ?? []) {
      const match = (p.users ?? []).find((u) => (u.email ?? "").toLowerCase() === setterEmail);
      if (match) { opUserId = match.id; phoneNumberId = p.id; break; }
    }
    if (!opUserId || !phoneNumberId) {
      throw new Error("Could not find this setter in OpenPhone (no matching user/phone-number).");
    }

    const sinceIso = new Date(Date.now() - data.since_days * 86400_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("call_logs")
      .select("id, to_number, started_at")
      .eq("user_id", data.user_id)
      .is("openphone_call_id", null)
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false });

    let scanned = 0, adopted = 0, withRec = 0, withTx = 0, withSum = 0;

    type OpCall = {
      id: string; status?: string; direction?: string; duration?: number;
      createdAt?: string; answeredAt?: string; completedAt?: string;
      participants?: string[];
    };
    type Dialogue = { identifier?: string; userId?: string; content?: string; text?: string };

    for (const row of rows ?? []) {
      scanned++;
      const to = row.to_number;
      if (!to) continue;
      const list = (await opGet(
        `/v1/calls?phoneNumberId=${phoneNumberId}&userId=${opUserId}&participants[]=${encodeURIComponent(to)}&maxResults=20`,
      )) as { data?: OpCall[] } | null;
      const calls = list?.data ?? [];
      if (calls.length === 0) continue;

      const target = new Date(row.started_at ?? new Date().toISOString()).getTime();
      let best = calls[0];
      let bestDiff = Math.abs(new Date(best.createdAt ?? 0).getTime() - target);
      for (const c of calls) {
        const d = Math.abs(new Date(c.createdAt ?? 0).getTime() - target);
        if (d < bestDiff) { best = c; bestDiff = d; }
      }
      if (bestDiff > 10 * 60_000) continue;

      const callId = best.id;
      const patch: Database["public"]["Tables"]["call_logs"]["Update"] = {
        openphone_call_id: callId,
        status: best.status ?? null,
        direction: best.direction ?? "outbound",
      };
      if (typeof best.duration === "number") patch.duration_sec = best.duration;
      if (best.answeredAt) patch.started_at = best.answeredAt;
      if (best.completedAt) patch.ended_at = best.completedAt;
      const fromNum = (best.participants ?? []).find((p) => p !== to) ?? null;
      if (fromNum) patch.from_number = fromNum;
      adopted++;

      const rec = (await opGet(`/v1/call-recordings/${encodeURIComponent(callId)}`)) as
        { data?: Array<{ url?: string; media?: Array<{ url?: string }> }> } | null;
      const recUrl = rec?.data?.[0]?.url || rec?.data?.[0]?.media?.[0]?.url;
      if (recUrl) { patch.recording_url = recUrl; withRec++; }

      const tx = (await opGet(`/v1/call-transcripts/${encodeURIComponent(callId)}`)) as
        { data?: { status?: string; dialogue?: Dialogue[]; text?: string; transcript?: string } } | null;
      if (tx?.data) {
        const d = tx.data;
        let t: string | null = null;
        if (Array.isArray(d.dialogue) && d.dialogue.length) {
          t = d.dialogue.map((x) => `${x.identifier || x.userId || "Speaker"}: ${x.content || x.text || ""}`.trim())
            .filter(Boolean).join("\n");
        } else if (typeof d.transcript === "string") t = d.transcript;
        else if (typeof d.text === "string") t = d.text;
        if (t) { patch.transcript = t; withTx++; }
        if (d.status) patch.transcript_status = d.status;
      }

      const sum = (await opGet(`/v1/call-summaries/${encodeURIComponent(callId)}`)) as
        { data?: { summary?: string | string[]; nextSteps?: string[] } } | null;
      if (sum?.data) {
        const d = sum.data;
        const parts: string[] = [];
        if (Array.isArray(d.summary)) parts.push(d.summary.join("\n"));
        else if (typeof d.summary === "string") parts.push(d.summary);
        if (Array.isArray(d.nextSteps) && d.nextSteps.length) {
          parts.push("Next steps:\n- " + d.nextSteps.join("\n- "));
        }
        if (parts.length) { patch.summary = parts.join("\n\n"); withSum++; }
      }

      await supabaseAdmin.from("call_logs").update(patch).eq("id", row.id);
    }

    return { scanned, adopted, withRec, withTx, withSum };
  });

// ---------- Email activity for a lead ----------
export const getLeadEmailActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    leadId: z.string().uuid().optional().nullable(),
    appointmentId: z.string().uuid().optional().nullable(),
    extraEmail: z.string().trim().email().optional().nullable(),
  }).parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = new Set<string>();
    if (data.extraEmail) emails.add(data.extraEmail.toLowerCase());
    if (data.leadId) {
      const { data: lead } = await supabaseAdmin
        .from("leads").select("email").eq("id", data.leadId).maybeSingle();
      if (lead?.email) emails.add(lead.email.toLowerCase());
    }
    if (data.appointmentId) {
      const { data: appt } = await supabaseAdmin
        .from("appointments").select("email").eq("id", data.appointmentId).maybeSingle();
      if (appt?.email) emails.add(appt.email.toLowerCase());
    }
    if (emails.size === 0) return [] as Array<{
      message_id: string; template_name: string; recipient_email: string;
      status: string; error_message: string | null; created_at: string;
    }>;

    // Case-insensitive match on stored recipient_email
    const emailList = Array.from(emails);
    const orFilter = emailList.map((e) => `recipient_email.ilike.${e}`).join(",");
    const { data: rows, error } = await supabaseAdmin
      .from("email_send_log")
      .select("message_id,template_name,recipient_email,status,error_message,created_at")
      .or(orFilter)
      .not("message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    // Deduplicate by message_id: keep latest status (rows already sorted desc)
    const seen = new Set<string>();
    const dedup: typeof rows = [] as any;
    for (const r of rows ?? []) {
      const key = r.message_id as string;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      dedup.push(r);
    }
    return dedup as Array<{
      message_id: string; template_name: string; recipient_email: string;
      status: string; error_message: string | null; created_at: string;
    }>;
  });

