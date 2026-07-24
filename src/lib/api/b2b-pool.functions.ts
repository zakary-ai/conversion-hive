import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const digits = (p: string | null | undefined) => (p ? String(p).replace(/\D/g, "") : "");

// ---------- Pool: unclaimed listing (for setters) ----------
export const listUnclaimedPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      search: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }).optional().parse,
  )
  .handler(async ({ data, context }) => {
    const limit = data?.limit ?? 50;
    const offset = data?.offset ?? 0;
    let q = context.supabase
      .from("b2b_lead_pool")
      .select("*", { count: "exact" })
      .eq("status", "unclaimed")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data?.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%`,
      );
    }
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

// ---------- Pool: my claimed leads ----------
export const listMyClaimedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("b2b_lead_pool")
      .select("*")
      .eq("claimed_by", context.userId)
      .in("status", ["claimed", "booked"] as any)
      .order("claimed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Pool: my didn't-pick-up queue ----------
export const listMyDidntPickUp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("b2b_lead_pool")
      .select("*")
      .eq("claimed_by", context.userId)
      .eq("status", "claimed")
      .eq("didnt_pick_up", true)
      .order("last_attempt_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Single lead ----------
export const getPoolLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("b2b_lead_pool").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead not found");
    const { data: attempts } = await context.supabase
      .from("b2b_call_attempts").select("*").eq("pool_lead_id", data.id)
      .order("occurred_at", { ascending: false });
    const { data: callbacks } = await context.supabase
      .from("b2b_callbacks").select("*").eq("pool_lead_id", data.id)
      .order("scheduled_at", { ascending: false });
    return { lead, attempts: attempts ?? [], callbacks: callbacks ?? [] };
  });

// ---------- Claim ----------
export const claimPoolLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("b2b_lead_pool")
      .update({
        claimed_by: context.userId,
        claimed_at: new Date().toISOString(),
        status: "claimed" as any,
      })
      .eq("id", data.id)
      .is("claimed_by", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Lead was already claimed by someone else.");
    return updated;
  });

// ---------- Log call outcome ----------
export const logCallOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      pool_lead_id: z.string().uuid(),
      outcome: z.enum(["booked", "callback_scheduled", "no_answer", "not_interested"]),
      note: z.string().max(2000).optional(),
      callback_at: z.string().datetime().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // verify ownership
    const { data: lead } = await context.supabase
      .from("b2b_lead_pool").select("id, claimed_by").eq("id", data.pool_lead_id).maybeSingle();
    if (!lead) throw new Error("Lead not found");
    if (lead.claimed_by !== context.userId) throw new Error("Not your lead.");

    // insert attempt
    const { error: attErr } = await context.supabase.from("b2b_call_attempts").insert({
      pool_lead_id: data.pool_lead_id,
      setter_id: context.userId,
      outcome: data.outcome,
      note: data.note ?? null,
    });
    if (attErr) throw new Error(attErr.message);

    // update pool row
    const patch: Record<string, any> = { last_attempt_at: new Date().toISOString() };
    if (data.outcome === "booked") { patch.status = "booked"; patch.didnt_pick_up = false; }
    else if (data.outcome === "not_interested") { patch.status = "burned"; patch.didnt_pick_up = false; }
    else if (data.outcome === "no_answer") { patch.didnt_pick_up = true; }
    else if (data.outcome === "callback_scheduled") { patch.didnt_pick_up = false; }
    await (context.supabase.from("b2b_lead_pool") as any).update(patch).eq("id", data.pool_lead_id);

    if (data.outcome === "callback_scheduled") {
      if (!data.callback_at) throw new Error("Callback time required");
      const { error: cbErr } = await context.supabase.from("b2b_callbacks").insert({
        pool_lead_id: data.pool_lead_id,
        setter_id: context.userId,
        scheduled_at: data.callback_at,
        note: data.note ?? null,
      });
      if (cbErr) throw new Error(cbErr.message);
    }
    return { ok: true };
  });

// ---------- Callbacks ----------
export const listMyCallbacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("b2b_callbacks")
      .select("*, lead:b2b_lead_pool(id, first_name, last_name, company, phone, email)")
      .eq("setter_id", context.userId)
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAllCallbacksAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("b2b_callbacks")
      .select("*, lead:b2b_lead_pool(id, first_name, last_name, company, phone, email)")
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    const setterIds = Array.from(new Set((data ?? []).map((r) => r.setter_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("user_id, full_name, email").in("user_id", setterIds);
    const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email]));
    return (data ?? []).map((r) => ({ ...r, setter_name: nameMap.get(r.setter_id) ?? null }));
  });

// ---------- Admin: pool overview + import ----------
export const adminListPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      status: z.enum(["all","unclaimed","claimed","burned","booked"]).optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
      offset: z.number().min(0).optional(),
    }).optional().parse,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data?.limit ?? 100;
    const offset = data?.offset ?? 0;
    let q = supabaseAdmin
      .from("b2b_lead_pool")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    if (data?.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%`);
    }
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    const setterIds = Array.from(new Set((rows ?? []).map((r) => r.claimed_by).filter(Boolean))) as string[];
    let nameMap = new Map<string, string | null>();
    if (setterIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles").select("user_id, full_name, email").in("user_id", setterIds);
      nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email] as const));
    }
    return {
      rows: (rows ?? []).map((r) => ({ ...r, setter_name: r.claimed_by ? nameMap.get(r.claimed_by) ?? null : null })),
      total: count ?? 0,
    };
  });

const PoolRowSchema = z.object({
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

export const adminBulkImportPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ rows: z.array(PoolRowSchema).max(2000) }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Dedupe within batch by email or phone digits
    const emailSeen = new Set<string>();
    const phoneSeen = new Set<string>();
    const clean: any[] = [];
    let dupInBatch = 0;
    for (const r of data.rows) {
      const email = r.email ? String(r.email).trim().toLowerCase() : null;
      const phone = r.phone ? String(r.phone).trim() : null;
      const pDigits = digits(phone);
      if (email && emailSeen.has(email)) { dupInBatch++; continue; }
      if (pDigits && phoneSeen.has(pDigits)) { dupInBatch++; continue; }
      if (email) emailSeen.add(email);
      if (pDigits) phoneSeen.add(pDigits);
      if (!email && !pDigits && !r.first_name && !r.last_name && !r.company) continue;
      clean.push({
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        company: r.company || null,
        website: r.website || null,
        email,
        phone,
        linkedin_url: r.linkedin_url || null,
        title: r.title || null,
        notes: r.notes || null,
        source: r.source || "csv-import",
        imported_by: context.userId,
      });
    }
    if (!clean.length) return { inserted: 0, duplicates: dupInBatch, skipped: data.rows.length - clean.length };

    // Fetch existing emails / phone digits to dedupe against DB
    const emails = clean.map((r) => r.email).filter(Boolean) as string[];
    const phonesDigits = clean.map((r) => digits(r.phone)).filter(Boolean);
    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    if (emails.length) {
      const { data: e } = await supabaseAdmin.from("b2b_lead_pool").select("email").in("email", emails);
      (e ?? []).forEach((x) => x.email && existingEmails.add(x.email.toLowerCase()));
    }
    if (phonesDigits.length) {
      // Best-effort phone dedupe: fetch all pool phones and compare digits
      const { data: p } = await supabaseAdmin.from("b2b_lead_pool").select("phone").not("phone", "is", null);
      (p ?? []).forEach((x) => { const d = digits(x.phone); if (d) existingPhones.add(d); });
    }
    const finalRows = clean.filter((r) => {
      if (r.email && existingEmails.has(r.email)) return false;
      const d = digits(r.phone);
      if (d && existingPhones.has(d)) return false;
      return true;
    });
    const dupInDb = clean.length - finalRows.length;
    if (!finalRows.length) return { inserted: 0, duplicates: dupInBatch + dupInDb, skipped: 0 };

    // Chunk insert
    let inserted = 0;
    for (let i = 0; i < finalRows.length; i += 500) {
      const chunk = finalRows.slice(i, i + 500);
      const { error, count } = await supabaseAdmin.from("b2b_lead_pool").insert(chunk, { count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? chunk.length;
    }
    return { inserted, duplicates: dupInBatch + dupInDb, skipped: 0 };
  });
