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
      segment: z.string().optional(),
      industry: z.string().optional(),
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
      .not("phone", "is", null)
      .neq("phone", "")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data?.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%`,
      );
    }
    if (data?.segment) q = q.eq("segment", data.segment);
    if (data?.industry) q = q.eq("industry", data.industry);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const listPoolFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("b2b_lead_pool")
      .select("segment, industry")
      .eq("status", "unclaimed")
      .eq("archived", false)
      .not("phone", "is", null)
      .neq("phone", "")
      .limit(5000);
    if (error) throw new Error(error.message);
    const segs = new Set<string>();
    const inds = new Set<string>();
    (data ?? []).forEach((r: any) => {
      if (r.segment) segs.add(r.segment);
      if (r.industry) inds.add(r.industry);
    });
    return {
      segments: Array.from(segs).sort(),
      industries: Array.from(inds).sort(),
    };
  });


// ---------- Pool: my claimed leads (with filters, search, pagination) ----------
type MyLeadTab = "all" | "uncontacted" | "booked" | "no_answer" | "not_interested";

export const listMyClaimedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      tab: z.enum(["all", "uncontacted", "booked", "no_answer", "not_interested"]).optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }).optional().parse,
  )
  .handler(async ({ data, context }) => {
    const tab: MyLeadTab = data?.tab ?? "all";
    const limit = data?.limit ?? 20;
    const offset = data?.offset ?? 0;
    let q = context.supabase
      .from("b2b_lead_pool")
      .select("*", { count: "exact" })
      .eq("claimed_by", context.userId)
      .eq("archived", false);

    if (tab === "booked") q = q.eq("status", "booked" as any);
    else if (tab === "not_interested") q = q.eq("status", "burned" as any);
    else if (tab === "no_answer") q = q.eq("status", "claimed" as any).eq("didnt_pick_up", true);
    else if (tab === "uncontacted") q = q.eq("status", "claimed" as any).is("last_attempt_at", null);
    else q = q.in("status", ["claimed", "booked", "burned"] as any);

    if (data?.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }

    q = q.order("claimed_at", { ascending: false }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

// ---------- Update lead notes (claimer or admin) ----------
export const updatePoolLeadNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), notes: z.string().max(10000) }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("b2b_lead_pool")
      .update({ notes: data.notes })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: full lead detail (lead + attempts + callbacks + calls + setter) ----------
export const adminGetPoolLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead, error } = await supabaseAdmin
      .from("b2b_lead_pool").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead not found");
    const [{ data: attempts }, { data: callbacks }, { data: calls }] = await Promise.all([
      supabaseAdmin.from("b2b_call_attempts").select("*").eq("pool_lead_id", data.id).order("occurred_at", { ascending: false }),
      supabaseAdmin.from("b2b_callbacks").select("*").eq("pool_lead_id", data.id).order("scheduled_at", { ascending: false }),
      (supabaseAdmin as any).from("call_logs").select("*").eq("pool_lead_id", data.id).order("created_at", { ascending: false }),
    ]);
    let setter: { user_id: string; full_name: string | null; email: string | null } | null = null;
    if (lead.claimed_by) {
      const { data: p } = await supabaseAdmin
        .from("profiles").select("user_id, full_name, email").eq("user_id", lead.claimed_by).maybeSingle();
      setter = p ?? null;
    }
    return {
      lead,
      attempts: attempts ?? [],
      callbacks: callbacks ?? [],
      calls: (calls ?? []) as any[],
      setter,
    };
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

// ---------- Create + auto-claim a new pool lead (setter "Book lead" flow) ----------
export const createAndClaimPoolLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      first_name: z.string().trim().max(120).optional().nullable(),
      last_name: z.string().trim().max(120).optional().nullable(),
      company: z.string().trim().max(200).optional().nullable(),
      phone: z.string().trim().max(50).optional().nullable(),
      email: z.string().trim().email().max(200).optional().nullable().or(z.literal("").transform(() => null)),
      notes: z.string().max(10000).optional().nullable(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const email = data.email ? data.email.toLowerCase() : null;
    const phone = data.phone ? data.phone.trim() : null;
    if (!email && !phone) throw new Error("Email or phone is required.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Best-effort dedupe: if a pool lead already exists on this email/phone, claim it if free.
    let existingId: string | null = null;
    if (email) {
      const { data: e } = await supabaseAdmin.from("b2b_lead_pool").select("id, claimed_by").eq("email", email).maybeSingle();
      if (e) existingId = e.id as string;
      if (e && e.claimed_by && e.claimed_by !== context.userId) throw new Error("A lead with this email is already claimed by someone else.");
    }
    if (!existingId && phone) {
      const d = digits(phone);
      if (d) {
        const { data: p } = await supabaseAdmin.from("b2b_lead_pool").select("id, claimed_by, phone").not("phone", "is", null).limit(5000);
        const hit = (p ?? []).find((r: any) => digits(r.phone) === d);
        if (hit) {
          if (hit.claimed_by && hit.claimed_by !== context.userId) throw new Error("A lead with this phone is already claimed by someone else.");
          existingId = hit.id as string;
        }
      }
    }

    if (existingId) {
      const { data: updated, error } = await (supabaseAdmin.from("b2b_lead_pool") as any)
        .update({
          first_name: data.first_name || null,
          last_name: data.last_name || null,
          company: data.company || null,
          phone,
          email,
          notes: data.notes || null,
          claimed_by: context.userId,
          claimed_at: new Date().toISOString(),
          status: "claimed",
        })
        .eq("id", existingId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }

    const { data: row, error } = await (supabaseAdmin.from("b2b_lead_pool") as any)
      .insert({
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        company: data.company || null,
        phone,
        email,
        notes: data.notes || null,
        source: "setter-manual",
        imported_by: context.userId,
        claimed_by: context.userId,
        claimed_at: new Date().toISOString(),
        status: "claimed",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
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

// ---------- Admin: export pool as CSV rows ----------
export const adminExportPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      segment: z.string().optional(),
      status: z.enum(["all","unclaimed","claimed","burned","booked"]).optional(),
    }).optional().parse,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cols = "segment,lead_type,first_name,last_name,title,company,website,email,email_status,phone,linkedin_url,city,state,industry,company_size,notes,status,claimed_at,imported_at";
    const rows: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      let q = supabaseAdmin.from("b2b_lead_pool").select(cols).order("imported_at", { ascending: false }).range(from, from + pageSize - 1);
      if (data?.segment) q = q.eq("segment", data.segment);
      if (data?.status && data.status !== "all") q = q.eq("status", data.status);
      const { data: chunk, error } = await q;
      if (error) throw new Error(error.message);
      const list = chunk ?? [];
      rows.push(...list);
      if (list.length < pageSize) break;
    }
    return { rows };
  });

const PoolRowSchema = z.object({
  segment: z.string().optional().nullable(),
  lead_type: z.string().optional().nullable(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  email_status: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  company_size: z.string().optional().nullable(),
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
        segment: r.segment || null,
        lead_type: r.lead_type || null,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        title: r.title || null,
        company: r.company || null,
        website: r.website || null,
        email,
        email_status: r.email_status || null,
        phone,
        linkedin_url: r.linkedin_url || null,
        city: r.city || null,
        state: r.state || null,
        industry: r.industry || null,
        company_size: r.company_size || null,
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

    // Chunk insert; on unique-violation fall back to per-row inserts so one
    // bad row doesn't fail the whole chunk.
    let inserted = 0;
    let dupOnInsert = 0;
    for (let i = 0; i < finalRows.length; i += 500) {
      const chunk = finalRows.slice(i, i + 500);
      const { error, count } = await supabaseAdmin.from("b2b_lead_pool").insert(chunk, { count: "exact" });
      if (!error) { inserted += count ?? chunk.length; continue; }
      if ((error as any).code !== "23505") throw new Error(error.message);
      for (const row of chunk) {
        const { error: e1 } = await supabaseAdmin.from("b2b_lead_pool").insert(row);
        if (!e1) inserted++;
        else if ((e1 as any).code === "23505") dupOnInsert++;
        else throw new Error(e1.message);
      }
    }
    return { inserted, duplicates: dupInBatch + dupInDb + dupOnInsert, skipped: 0 };

  });

// ---------- Setter booking link + info email ----------
export const getMyBookingLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureBookingSlug, bookingLinkFor } = await import("@/lib/b2b-booking.server");
    const slug = await ensureBookingSlug(context.userId);
    return { slug, url: bookingLinkFor(slug) };
  });

/**
 * Emails the lead the ChatGPT-ads overview with this setter's personal
 * booking link, and logs an "info_emailed" attempt on the lead.
 */
export const sendLeadInfoEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    pool_lead_id: z.string().uuid(),
    email: z.string().trim().email().max(200).optional(),
    note: z.string().trim().max(2000).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (supabaseAdmin.from("b2b_lead_pool") as any)
      .select("id, first_name, last_name, email, claimed_by")
      .eq("id", data.pool_lead_id)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");
    if (lead.claimed_by !== context.userId) throw new Error("Not your lead.");

    const recipient = (data.email || (lead.email as string | null) || "").trim().toLowerCase();
    if (!recipient) throw new Error("This lead has no email — add one first.");
    if (recipient !== (lead.email as string | null)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("b2b_lead_pool") as any).update({ email: recipient }).eq("id", lead.id);
    }

    const { ensureBookingSlug, bookingLinkFor } = await import("@/lib/b2b-booking.server");
    const slug = await ensureBookingSlug(context.userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabaseAdmin.from("profiles") as any)
      .select("full_name").eq("user_id", context.userId).maybeSingle();

    const { sendTransactional } = await import("@/lib/email/transactional.server");
    const res = await sendTransactional({
      templateName: "chatgpt-ads-info",
      recipientEmail: recipient,
      idempotencyKey: `b2b-info-${lead.id}-${Date.now()}`,
      templateData: {
        name: (lead.first_name as string | null) ?? null,
        setterName: (profile?.full_name as string | null) ?? null,
        bookingUrl: bookingLinkFor(slug),
      },
    });
    if (!res.ok) throw new Error(res.reason === "email_suppressed" ? "That address has unsubscribed." : "Could not send the email.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("b2b_call_attempts") as any).insert({
      pool_lead_id: lead.id,
      setter_id: context.userId,
      outcome: "info_emailed",
      note: data.note ?? `Info email sent to ${recipient}`,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("b2b_lead_pool") as any)
      .update({ last_attempt_at: new Date().toISOString() }).eq("id", lead.id);

    return { ok: true, email: recipient, booking_url: bookingLinkFor(slug) };
  });

// ---------- Admin: send the 1-pager to any address, crediting a chosen setter ----------
export const adminListB2bSetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roles } = await (supabaseAdmin.from("user_roles") as any)
      .select("user_id").eq("role", "b2b_setter");
    const ids = (roles ?? []).map((r: { user_id: string }) => r.user_id);
    if (!ids.length) return { rows: [] as { user_id: string; full_name: string; email: string | null }[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profs } = await (supabaseAdmin.from("profiles") as any)
      .select("user_id, full_name, email").in("user_id", ids);
    const rows = (profs ?? [])
      .map((p: { user_id: string; full_name: string | null; email: string | null }) => ({
        user_id: p.user_id,
        full_name: p.full_name || p.email || "Setter",
        email: p.email ?? null,
      }))
      .sort((a: { full_name: string }, b: { full_name: string }) => a.full_name.localeCompare(b.full_name));
    return { rows };
  });

export const adminSendInfoEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    email: z.string().trim().email().max(200),
    name: z.string().trim().max(120).optional(),
    setter_user_id: z.string().uuid(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabaseAdmin.from("profiles") as any)
      .select("full_name").eq("user_id", data.setter_user_id).maybeSingle();

    const { ensureBookingSlug, bookingLinkFor } = await import("@/lib/b2b-booking.server");
    const slug = await ensureBookingSlug(data.setter_user_id);
    const bookingUrl = bookingLinkFor(slug);

    const recipient = data.email.toLowerCase();
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    const res = await sendTransactional({
      templateName: "chatgpt-ads-info",
      recipientEmail: recipient,
      idempotencyKey: `b2b-info-admin-${recipient}-${Date.now()}`,
      templateData: {
        name: data.name || null,
        setterName: (profile?.full_name as string | null) ?? null,
        bookingUrl,
      },
    });
    if (!res.ok) {
      throw new Error(res.reason === "email_suppressed" ? "That address has unsubscribed." : "Could not send the email.");
    }
    return { ok: true, email: recipient, booking_url: bookingUrl };
  });
