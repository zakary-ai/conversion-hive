import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      isAdmin: roleSet.has("admin"),
      isClient: roleSet.has("client"),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    full_name: z.string().max(120).optional(),
    company_name: z.string().max(120).optional(),
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
    const { error } = await supabase.from("module_completions")
      .upsert({ user_id: userId, module_id: data.module_id }, { onConflict: "user_id,module_id" });
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
    const { data: qs } = await context.supabase
      .from("quiz_questions").select("*").eq("module_id", data.module_id).order("created_at");
    return qs ?? [];
  });

export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    module_id: z.string().uuid(),
    answers: z.array(z.number().int()),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: qs } = await supabase
      .from("quiz_questions").select("id, correct_answer").eq("module_id", data.module_id).order("created_at");
    const questions = qs ?? [];
    let correct = 0;
    questions.forEach((q, i) => { if (data.answers[i] === q.correct_answer) correct++; });
    const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    const { error } = await supabase.from("quiz_attempts").insert({
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
  }).parse)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.do_not_contact !== undefined) patch.do_not_contact = data.do_not_contact;
    if (data.callback_at !== undefined) patch.callback_at = data.callback_at;
    if (data.contacted === true) patch.contacted_at = new Date().toISOString();
    if (data.contacted === false) patch.contacted_at = null;
    const { error } = await context.supabase.from("leads").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
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

export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(AppointmentInput.parse)
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase.from("appointments")
      .insert({ ...data, user_id: context.userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
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
    const [clients, leads, contactedToday, commissions, recentLeads, recentCommissions] = await Promise.all([
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "client"),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("contacted_at", todayStart.toISOString()),
      supabase.from("commissions").select("amount"),
      supabase.from("leads").select("id, name, status, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("commissions").select("id, amount, note, created_at").order("created_at", { ascending: false }).limit(5),
    ]);
    return {
      totalClients: clients.count ?? 0,
      totalLeads: leads.count ?? 0,
      contactedToday: contactedToday.count ?? 0,
      totalCommissions: (commissions.data ?? []).reduce((s, c) => s + Number(c.amount), 0),
      recentLeads: recentLeads.data ?? [],
      recentCommissions: recentCommissions.data ?? [],
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
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [profile, leads, completions, attempts, commissions, totalModules] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", data.user_id).maybeSingle(),
      supabase.from("leads").select("*").eq("assigned_user_id", data.user_id).order("created_at", { ascending: false }),
      supabase.from("module_completions").select("*").eq("user_id", data.user_id),
      supabase.from("quiz_attempts").select("*, modules(title)").eq("user_id", data.user_id).order("completed_at", { ascending: false }),
      supabase.from("commissions").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }),
      supabase.from("modules").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    const balance = (commissions.data ?? []).reduce((s, c) => s + Number(c.amount), 0);
    return {
      profile: profile.data,
      leads: leads.data ?? [],
      completions: completions.data ?? [],
      attempts: attempts.data ?? [],
      commissions: commissions.data ?? [],
      totalModules: totalModules.count ?? 0,
      balance,
    };
  });
