import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OP_BASE = "https://api.openphone.com/v1";

function normalizeE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "+" + digits;
}

async function opFetch(path: string, init: RequestInit = {}) {
  const key = process.env.OPENPHONE_API_KEY;
  if (!key) throw new Error("OPENPHONE_API_KEY is not configured");
  const res = await fetch(`${OP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "object" && body && "message" in body
      ? String((body as { message: unknown }).message)
      : (typeof body === "string" ? body : `HTTP ${res.status}`);
    throw new Error(`OpenPhone: ${msg}`);
  }
  return body as Record<string, unknown> | null;
}

async function assertAdmin(supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "client" }) => unknown }, userId: string) {
  const res = await (supabase.rpc("has_role", { _user_id: userId, _role: "admin" }) as Promise<{ data: boolean | null }>);
  if (!res.data) throw new Error("Forbidden");
}

// ---------- Personal phone (setter sets their cell, used as call-forwarding target in OpenPhone) ----------
export const setPersonalPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ phone: z.string().min(7).max(20) }).parse)
  .handler(async ({ data, context }) => {
    const phone = normalizeE164(data.phone);
    const { error } = await context.supabase
      .from("profiles")
      .update({ personal_phone_e164: phone })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, phone };
  });

// ---------- Number pool (admin) ----------
export const listNumberPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("openphone_number_pool")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.assigned_user_id).filter(Boolean))) as string[];
    let profilesById = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      profilesById = new Map((profs ?? []).map((p) => [p.user_id, { full_name: p.full_name, email: p.email }]));
    }
    return rows.map((r) => ({ ...r, profiles: r.assigned_user_id ? profilesById.get(r.assigned_user_id) ?? null : null }));
  });

export const addNumberToPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    phone_e164: z.string().min(7).max(20),
    openphone_number_id: z.string().min(1).max(100),
    note: z.string().max(200).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("openphone_number_pool").insert({
      phone_e164: normalizeE164(data.phone_e164),
      openphone_number_id: data.openphone_number_id.trim(),
      note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeNumberFromPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("openphone_number_pool").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Provision a number for a user ----------
export const provisionNumberForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("openphone_number_e164").eq("user_id", data.user_id).maybeSingle();
    if (profile?.openphone_number_e164) {
      throw new Error("User already has an assigned number");
    }

    const { data: pool, error: poolErr } = await supabaseAdmin
      .from("openphone_number_pool")
      .select("*")
      .is("assigned_user_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (poolErr) throw new Error(poolErr.message);
    if (!pool) throw new Error("No free phone numbers in the pool. Add one in Admin → Settings → Phone numbers.");

    // Try to find/create the OpenPhone user. Look up by email.
    const { data: user } = await supabaseAdmin.from("profiles").select("email, full_name").eq("user_id", data.user_id).maybeSingle();
    let openphoneUserId: string | null = null;
    try {
      const users = await opFetch(`/users`) as { data?: Array<{ id: string; email?: string }> } | null;
      const match = users?.data?.find((u) => u.email?.toLowerCase() === (user?.email ?? "").toLowerCase());
      if (match) openphoneUserId = match.id;
    } catch (e) {
      console.warn("[openphone] listing users failed; continuing without OP user id:", (e as Error).message);
    }

    const { error: poolUpdErr } = await supabaseAdmin
      .from("openphone_number_pool")
      .update({ assigned_user_id: data.user_id, assigned_at: new Date().toISOString() })
      .eq("id", pool.id);
    if (poolUpdErr) throw new Error(poolUpdErr.message);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        openphone_number_e164: pool.phone_e164,
        openphone_number_id: pool.openphone_number_id,
        openphone_user_id: openphoneUserId,
      })
      .eq("user_id", data.user_id);
    if (profErr) throw new Error(profErr.message);

    return { ok: true, phone: pool.phone_e164 };
  });

export const unassignUserNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("openphone_number_pool")
      .update({ assigned_user_id: null, assigned_at: null })
      .eq("assigned_user_id", data.user_id);
    await supabaseAdmin.from("profiles")
      .update({ openphone_number_e164: null, openphone_number_id: null, openphone_user_id: null })
      .eq("user_id", data.user_id);
    return { ok: true };
  });

// ---------- Start a bridge call ----------
export const startBridgeCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: lead }, { data: profile }] = await Promise.all([
      supabase.from("leads").select("id, phone, name").eq("id", data.lead_id).maybeSingle(),
      supabase.from("profiles").select("personal_phone_e164, openphone_number_e164").eq("user_id", userId).maybeSingle(),
    ]);
    if (!lead) throw new Error("Lead not found");
    if (!lead.phone) throw new Error("Lead has no phone number");

    const toNumber = normalizeE164(lead.phone);
    const fromNumber = profile?.openphone_number_e164 ?? null;

    // NOTE: Quo/OpenPhone's public API does not expose programmatic outbound
    // call initiation (no POST /v1/calls). We log the attempt and return the
    // lead's number so the client opens the device dialer. Setters using the
    // Quo mobile/desktop app can dial from their assigned Quo number there;
    // dialing from this app's tel: link will use the device's default line.
    const { data: log } = await supabase.from("call_logs").insert({
      lead_id: lead.id,
      user_id: userId,
      openphone_call_id: null,
      direction: "outbound",
      status: "initiated",
      from_number: fromNumber,
      to_number: toNumber,
      started_at: new Date().toISOString(),
    }).select("id").maybeSingle();

    await supabase.from("leads").update({ contacted_at: new Date().toISOString() }).eq("id", lead.id);

    return { ok: true, call_log_id: log?.id, dial: toNumber, from: fromNumber };
  });

// ---------- Call history ----------
export const listCallsForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("call_logs").select("*")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCallsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("call_logs").select("*, leads:lead_id(name, company)")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
