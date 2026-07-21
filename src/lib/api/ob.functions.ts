import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type ObLeadStatus = Database["public"]["Enums"]["ob_lead_status"];
type ObEmailStatus = Database["public"]["Enums"]["ob_email_status"];
type ObCampaignChannel = Database["public"]["Enums"]["ob_campaign_channel"];
type ObCampaignStatus = Database["public"]["Enums"]["ob_campaign_status"];
type ObConvCategory = Database["public"]["Enums"]["ob_conversation_category"];

// ---------- helpers ----------
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}
function normalizeCompanyName(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|gmbh|plc)\.?/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function extractDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.trim().startsWith("http") ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  return d || null;
}
function normalizeEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = String(e).trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(t) ? t : null;
}

// ---------- Lookup: setters ----------
export const obListSetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["b2b_setter"] as any);
    const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", ids);
    return (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      name: p.full_name || p.email || "—",
      email: p.email,
    }));
  });

// ---------- Leads: list ----------
export const obListLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    page: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(200).default(50),
    search: z.string().default(""),
    status: z.string().default("all"),
    ownerSetterId: z.string().default("all"), // "all" | "unassigned" | uuid
    emailStatus: z.string().default("all"),
    niche: z.string().default(""),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    let q = supabaseAdmin.from("ob_leads").select(
      "id, first_name, last_name, title, email, email_status, phone, linkedin_url, status, lead_score, owner_setter_id, source, selection_reason, updated_at, created_at, company:ob_companies(id, name, city, state, niche, domain, website, google_rating, google_review_count)",
      { count: "exact" }
    );
    if (!isAdmin) q = q.eq("owner_setter_id", context.userId);
    if (data.status !== "all") q = q.eq("status", data.status as ObLeadStatus);
    if (data.emailStatus !== "all") q = q.eq("email_status", data.emailStatus as ObEmailStatus);
    if (data.ownerSetterId === "unassigned") q = q.is("owner_setter_id", null);
    else if (data.ownerSetterId !== "all") q = q.eq("owner_setter_id", data.ownerSetterId);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
    }
    const from = data.page * data.pageSize;
    q = q.order("updated_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    let filtered = rows ?? [];
    if (data.niche) {
      const n = data.niche.toLowerCase();
      filtered = filtered.filter((r: any) => (r.company?.niche ?? "").toLowerCase().includes(n));
    }
    return { rows: filtered, total: count ?? 0 };
  });

// ---------- Leads: detail with timeline ----------
export const obGetLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead, error } = await supabaseAdmin
      .from("ob_leads")
      .select("*, company:ob_companies(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !lead) throw new Error(error?.message || "Not found");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin && (lead as any).owner_setter_id !== context.userId) throw new Error("Forbidden");
    const [{ data: acts }, { data: convs }, { data: calls }, { data: li }, { data: appts }] = await Promise.all([
      supabaseAdmin.from("ob_outreach_activities").select("*").eq("lead_id", data.id).order("occurred_at", { ascending: false }).limit(200),
      supabaseAdmin.from("ob_conversations").select("id, category, needs_response, last_inbound_at, last_outbound_at, channel").eq("lead_id", data.id),
      supabaseAdmin.from("ob_call_attempts").select("*").eq("lead_id", data.id).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("ob_linkedin_tasks").select("*").eq("lead_id", data.id).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("ob_appointments").select("*").eq("lead_id", data.id).order("scheduled_at", { ascending: false }).limit(50),
    ]);
    return { lead, activities: acts ?? [], conversations: convs ?? [], calls: calls ?? [], linkedinTasks: li ?? [], appointments: appts ?? [] };
  });

// ---------- CSV Import ----------
const importRowSchema = z.object({
  company_name: z.string().optional().default(""),
  website: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  google_rating: z.string().optional().default(""),
  google_review_count: z.string().optional().default(""),
  google_maps_url: z.string().optional().default(""),
  niche: z.string().optional().default(""),
  selection_reason: z.string().optional().default(""),
  first_name: z.string().optional().default(""),
  last_name: z.string().optional().default(""),
  title: z.string().optional().default(""),
  email: z.string().optional().default(""),
  email_status: z.string().optional().default(""),
  linkedin_url: z.string().optional().default(""),
  lead_score: z.string().optional().default(""),
});

export const obImportLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ rows: z.array(importRowSchema).min(1).max(10000) }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Preload suppression list
    const { data: supRows } = await supabaseAdmin.from("ob_suppression_list").select("email, phone, domain");
    const supEmails = new Set((supRows ?? []).map((s) => (s.email ?? "").toLowerCase()).filter(Boolean));
    const supPhones = new Set((supRows ?? []).map((s) => (s.phone ?? "")).filter(Boolean));
    const supDomains = new Set((supRows ?? []).map((s) => (s.domain ?? "").toLowerCase()).filter(Boolean));

    let imported = 0;
    const duplicates: any[] = [];
    const suppressed: any[] = [];
    const invalid: any[] = [];

    // Preload existing emails for fast dedupe
    const emails = data.rows.map((r) => normalizeEmail(r.email)).filter(Boolean) as string[];
    const existingEmails = new Set<string>();
    for (let i = 0; i < emails.length; i += 500) {
      const chunk = emails.slice(i, i + 500);
      const { data: existing } = await supabaseAdmin
        .from("ob_leads").select("email").in("email", chunk);
      (existing ?? []).forEach((e) => e.email && existingEmails.add(e.email.toLowerCase()));
    }

    // company cache
    const companyCache = new Map<string, string>(); // domain or normalizedName+city -> id

    for (const r of data.rows) {
      const email = normalizeEmail(r.email);
      const phone = normalizePhone(r.phone);
      if (!email && !phone) { invalid.push({ row: r, reason: "missing email and phone" }); continue; }

      const domain = extractDomain(r.website);
      const normName = r.company_name ? normalizeCompanyName(r.company_name) : "";
      const cityKey = (r.city || "").toLowerCase().trim();

      if ((email && supEmails.has(email)) || (phone && supPhones.has(phone)) || (domain && supDomains.has(domain))) {
        suppressed.push({ row: r, reason: "on suppression list" });
        continue;
      }
      if (email && existingEmails.has(email)) {
        duplicates.push({ row: r, reason: "duplicate email" });
        continue;
      }

      // company find/create
      const cacheKey = domain ? `d:${domain}` : `n:${normName}|${cityKey}`;
      let companyId = companyCache.get(cacheKey) ?? null;
      if (!companyId) {
        let existing;
        if (domain) {
          const { data: c } = await supabaseAdmin.from("ob_companies").select("id").eq("domain", domain).limit(1).maybeSingle();
          existing = c;
        } else if (normName) {
          const { data: c } = await supabaseAdmin.from("ob_companies").select("id")
            .eq("normalized_name", normName).eq("city", r.city || "").limit(1).maybeSingle();
          existing = c;
        }
        if (existing) {
          companyId = existing.id;
        } else if (r.company_name || domain) {
          const { data: newC, error: cErr } = await supabaseAdmin.from("ob_companies").insert({
            name: r.company_name || domain || "Unknown",
            normalized_name: normName || null,
            domain: domain,
            website: r.website || null,
            phone: normalizePhone(r.phone),
            address: r.address || null,
            city: r.city || null,
            state: r.state || null,
            google_rating: r.google_rating ? Number(r.google_rating) || null : null,
            google_review_count: r.google_review_count ? parseInt(r.google_review_count) || null : null,
            google_maps_url: r.google_maps_url || null,
            niche: r.niche || null,
            selection_reason: r.selection_reason || null,
            source: "csv_import",
          }).select("id").single();
          if (cErr || !newC) { invalid.push({ row: r, reason: cErr?.message || "company insert failed" }); continue; }
          companyId = newC.id;
        }
        if (companyId) companyCache.set(cacheKey, companyId);
      }

      const es = ["unverified","valid","invalid","catch_all","unknown","role_based"].includes(r.email_status)
        ? (r.email_status as ObEmailStatus) : "unverified";

      const { error: lErr } = await supabaseAdmin.from("ob_leads").insert({
        company_id: companyId,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        title: r.title || null,
        email,
        email_status: es,
        phone,
        linkedin_url: r.linkedin_url || null,
        status: "new",
        lead_score: r.lead_score ? parseInt(r.lead_score) || null : null,
        selection_reason: r.selection_reason || null,
        source: "csv_import",
      });
      if (lErr) { invalid.push({ row: r, reason: lErr.message }); continue; }
      if (email) existingEmails.add(email);
      imported++;
    }

    return { imported, duplicates, suppressed, invalid };
  });

// ---------- Assignment ----------
export const obAssignLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    leadIds: z.array(z.string().uuid()).min(1).max(2000),
    setterUserId: z.string().uuid().nullable(),
    override: z.boolean().default(false),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: leads } = await supabaseAdmin
      .from("ob_leads").select("id, company_id, owner_setter_id").in("id", data.leadIds);
    const companyIds = Array.from(new Set((leads ?? []).map((l) => l.company_id).filter(Boolean))) as string[];
    let conflictIds: string[] = [];
    if (companyIds.length && data.setterUserId) {
      const { data: comps } = await supabaseAdmin
        .from("ob_companies").select("id, owner_setter_id").in("id", companyIds);
      const conflictCompanies = new Set(
        (comps ?? []).filter((c) => c.owner_setter_id && c.owner_setter_id !== data.setterUserId).map((c) => c.id)
      );
      conflictIds = (leads ?? []).filter((l) => l.company_id && conflictCompanies.has(l.company_id)).map((l) => l.id);
      if (conflictIds.length && !data.override) {
        return { assigned: 0, conflicts: conflictIds.length, needsOverride: true };
      }
    }
    const toAssign = data.override ? data.leadIds : data.leadIds.filter((id) => !conflictIds.includes(id));
    if (!toAssign.length) return { assigned: 0, conflicts: conflictIds.length, needsOverride: false };
    const { error } = await supabaseAdmin
      .from("ob_leads").update({ owner_setter_id: data.setterUserId }).in("id", toAssign);
    if (error) throw new Error(error.message);
    if (companyIds.length) {
      await supabaseAdmin.from("ob_companies").update({ owner_setter_id: data.setterUserId }).in("id", companyIds);
    }
    // activities
    await supabaseAdmin.from("ob_outreach_activities").insert(
      toAssign.map((id) => ({ lead_id: id, setter_id: data.setterUserId, type: "status_change" as any, detail: data.setterUserId ? "Assigned to setter" : "Unassigned" }))
    );
    return { assigned: toAssign.length, conflicts: 0, needsOverride: false };
  });

// ---------- Campaigns ----------
export const obListCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    let q = supabaseAdmin.from("ob_campaigns").select("*").order("created_at", { ascending: false });
    if (!isAdmin) q = q.eq("setter_id", context.userId);
    const { data: campaigns } = await q;
    if (!campaigns?.length) return [];
    const ids = campaigns.map((c) => c.id);
    const { data: counts } = await supabaseAdmin
      .from("ob_campaign_memberships").select("campaign_id, status").in("campaign_id", ids);
    const byId: Record<string, { total: number; pending: number; active: number }> = {};
    for (const c of campaigns) byId[c.id] = { total: 0, pending: 0, active: 0 };
    (counts ?? []).forEach((m) => {
      byId[m.campaign_id].total++;
      if (m.status === "pending") byId[m.campaign_id].pending++;
      if (m.status === "active") byId[m.campaign_id].active++;
    });
    return campaigns.map((c) => ({ ...c, ...byId[c.id] }));
  });

export const obCreateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    name: z.string().min(1).max(200),
    channel: z.enum(["email","linkedin","call"]),
    setterUserId: z.string().uuid().nullable(),
    smartleadCampaignId: z.string().optional().nullable(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c, error } = await supabaseAdmin.from("ob_campaigns").insert({
      name: data.name, channel: data.channel as ObCampaignChannel,
      setter_id: data.setterUserId, smartlead_campaign_id: data.smartleadCampaignId || null,
      status: "active" as ObCampaignStatus,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return c;
  });

export const obAddLeadsToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    campaignId: z.string().uuid(),
    leadIds: z.array(z.string().uuid()).min(1).max(5000),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await supabaseAdmin.from("ob_campaigns").select("*").eq("id", data.campaignId).single();
    if (!campaign) throw new Error("Campaign not found");
    const { data: leads } = await supabaseAdmin
      .from("ob_leads").select("id, email, email_status, owner_setter_id")
      .in("id", data.leadIds);
    const eligible = (leads ?? []).filter((l) => {
      if (campaign.setter_id && l.owner_setter_id !== campaign.setter_id) return false;
      if (campaign.channel === "email" && (l.email_status !== "valid" || !l.email)) return false;
      return true;
    });
    if (!eligible.length) return { added: 0, skipped: (leads ?? []).length };
    const { error } = await supabaseAdmin.from("ob_campaign_memberships").upsert(
      eligible.map((l) => ({ lead_id: l.id, campaign_id: data.campaignId, status: "pending" as const })),
      { onConflict: "lead_id,campaign_id", ignoreDuplicates: true }
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("ob_outreach_activities").insert(
      eligible.map((l) => ({ lead_id: l.id, setter_id: campaign.setter_id, type: "status_change" as any, detail: `Added to campaign ${campaign.name}` }))
    );
    return { added: eligible.length, skipped: (leads ?? []).length - eligible.length };
  });

// ---------- Sync to Smartlead ----------
const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";
async function smartleadFetch(path: string, init?: RequestInit) {
  const key = process.env.SMARTLEAD_API_KEY;
  if (!key) throw new Error("SMARTLEAD_API_KEY not configured");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${SMARTLEAD_BASE}${path}${sep}api_key=${encodeURIComponent(key)}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body: any;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`Smartlead ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

export const obSyncCampaignToSmartlead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ campaignId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await supabaseAdmin.from("ob_campaigns").select("*").eq("id", data.campaignId).single();
    if (!campaign?.smartlead_campaign_id) throw new Error("Campaign has no Smartlead ID");
    const { data: pending } = await supabaseAdmin
      .from("ob_campaign_memberships")
      .select("id, lead_id, lead:ob_leads(id, email, first_name, last_name, phone, linkedin_url, selection_reason, company:ob_companies(name))")
      .eq("campaign_id", data.campaignId).eq("status", "pending");
    if (!pending?.length) return { pushed: 0, failed: 0, errors: [] };

    let pushed = 0, failed = 0;
    const errors: string[] = [];
    const BATCH = 100;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const lead_list = batch.map((m: any) => ({
        email: m.lead?.email,
        first_name: m.lead?.first_name ?? "",
        last_name: m.lead?.last_name ?? "",
        company_name: m.lead?.company?.name ?? "",
        phone_number: m.lead?.phone ?? "",
        linkedin_profile: m.lead?.linkedin_url ?? "",
        custom_fields: {
          selection_reason: m.lead?.selection_reason ?? "",
          conversion_lab_lead_id: m.lead_id,
        },
      })).filter((l) => !!l.email);

      try {
        const resp = await smartleadFetch(
          `/campaigns/${campaign.smartlead_campaign_id}/leads`,
          { method: "POST", body: JSON.stringify({ lead_list, settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false, ignore_duplicate_leads_in_other_campaign: false } }) }
        );
        const upload = resp?.upload_details ?? {};
        // Update memberships and lead statuses
        const membershipIds = batch.map((m: any) => m.id);
        const leadIds = batch.map((m: any) => m.lead_id);
        await supabaseAdmin.from("ob_campaign_memberships").update({ status: "active" }).in("id", membershipIds);
        await supabaseAdmin.from("ob_leads").update({ status: "in_sequence" as ObLeadStatus }).in("id", leadIds);
        await supabaseAdmin.from("ob_outreach_activities").insert(
          leadIds.map((id) => ({ lead_id: id, setter_id: campaign.setter_id, type: "email_sent" as any, detail: `Pushed to Smartlead: ${JSON.stringify(upload).slice(0, 200)}` }))
        );
        pushed += lead_list.length;
      } catch (e: any) {
        failed += batch.length;
        errors.push(e.message || String(e));
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { pushed, failed, errors };
  });

// ---------- Setter Inbox ----------
export const obListConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ tab: z.string().default("needs_response") }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });

    // subquery: get lead ids owned by me (or all if admin)
    let leadQ = supabaseAdmin.from("ob_leads").select("id, first_name, last_name, email, company:ob_companies(name)");
    if (!isAdmin) leadQ = leadQ.eq("owner_setter_id", context.userId);
    const { data: leads } = await leadQ;
    if (!leads?.length) return [];
    const leadIds = leads.map((l) => l.id);
    const leadMap = new Map(leads.map((l: any) => [l.id, l]));

    let q = supabaseAdmin.from("ob_conversations")
      .select("*").in("lead_id", leadIds).order("last_inbound_at", { ascending: true, nullsFirst: false });

    if (data.tab === "needs_response") q = q.eq("needs_response", true);
    else if (data.tab === "positive") q = q.eq("category", "positive");
    else if (data.tab === "question") q = q.eq("category", "question");
    else if (data.tab === "objection") q = q.eq("category", "objection");
    else if (data.tab === "meeting_booked") q = q.eq("category", "meeting_booked");
    else if (data.tab === "other") q = q.in("category", ["out_of_office","wrong_person","not_interested","unsubscribe","info_requested","uncategorized"] as any);

    const { data: convs, error } = await q.limit(300);
    if (error) throw new Error(error.message);
    return (convs ?? []).map((c) => ({ ...c, lead: leadMap.get(c.lead_id) }));
  });

export const obGetConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv, error } = await supabaseAdmin
      .from("ob_conversations")
      .select("*, lead:ob_leads(*, company:ob_companies(*))")
      .eq("id", data.id).single();
    if (error || !conv) throw new Error(error?.message || "Not found");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin && (conv as any).lead?.owner_setter_id !== context.userId) throw new Error("Forbidden");
    const [{ data: messages }, { data: activities }] = await Promise.all([
      supabaseAdmin.from("ob_messages").select("*").eq("conversation_id", data.id).order("sent_at", { ascending: true, nullsFirst: true }),
      supabaseAdmin.from("ob_outreach_activities").select("*").eq("lead_id", (conv as any).lead_id).order("occurred_at", { ascending: false }).limit(50),
    ]);
    return { conversation: conv, messages: messages ?? [], activities: activities ?? [] };
  });

// ---------- Send reply via Smartlead ----------
export const obSendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    bodyHtml: z.string().min(1).max(50000),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin
      .from("ob_conversations").select("*, lead:ob_leads(id, owner_setter_id, email)").eq("id", data.conversationId).single();
    if (!conv) throw new Error("Conversation not found");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin && (conv as any).lead?.owner_setter_id !== context.userId) throw new Error("Forbidden");

    // find the most recent inbound message for stats/message id and reply threading
    const { data: msgs } = await supabaseAdmin
      .from("ob_messages")
      .select("*").eq("conversation_id", data.conversationId).eq("direction", "inbound")
      .order("sent_at", { ascending: false }).limit(1);
    const last = msgs?.[0];

    // find a campaign for this lead
    const { data: memb } = await supabaseAdmin
      .from("ob_campaign_memberships")
      .select("campaign:ob_campaigns(id, smartlead_campaign_id)")
      .eq("lead_id", (conv as any).lead_id).limit(1);
    const smartleadCampaignId = (memb as any)?.[0]?.campaign?.smartlead_campaign_id;

    if (smartleadCampaignId && last?.smartlead_stats_id) {
      try {
        await smartleadFetch(
          `/campaigns/${smartleadCampaignId}/reply-email-thread`,
          { method: "POST", body: JSON.stringify({
            email_stats_id: last.smartlead_stats_id,
            email_body: data.bodyHtml,
            reply_message_id: last.smartlead_message_id ?? undefined,
            reply_email_time: new Date().toISOString(),
            reply_email_body: data.bodyHtml,
          }) }
        );
      } catch (e: any) {
        throw new Error(`Smartlead reply failed: ${e.message}`);
      }
    }
    // Log outbound message locally regardless
    const now = new Date().toISOString();
    await supabaseAdmin.from("ob_messages").insert({
      conversation_id: data.conversationId,
      direction: "outbound",
      from_email: last?.to_email ?? null,
      to_email: last?.from_email ?? (conv as any).lead?.email ?? null,
      subject: last?.subject ? (last.subject.startsWith("Re:") ? last.subject : `Re: ${last.subject}`) : null,
      body_html: data.bodyHtml,
      body_text: data.bodyHtml.replace(/<[^>]+>/g, " ").trim(),
      sent_at: now,
    });
    await supabaseAdmin.from("ob_conversations").update({ needs_response: false, last_outbound_at: now }).eq("id", data.conversationId);
    await supabaseAdmin.from("ob_outreach_activities").insert({
      lead_id: (conv as any).lead_id, setter_id: context.userId, type: "email_sent" as any, detail: "Reply sent from inbox",
    });
    return { ok: true, sentViaSmartlead: !!(smartleadCampaignId && last?.smartlead_stats_id) };
  });

// ---------- Set category / quick actions ----------
export const obSetCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    category: z.enum(["uncategorized","positive","question","objection","info_requested","out_of_office","not_interested","wrong_person","unsubscribe","meeting_booked"]),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin.from("ob_conversations").select("lead_id, lead:ob_leads(owner_setter_id)").eq("id", data.conversationId).single();
    if (!conv) throw new Error("Conversation not found");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin && (conv as any).lead?.owner_setter_id !== context.userId) throw new Error("Forbidden");
    await supabaseAdmin.from("ob_conversations").update({ category: data.category as ObConvCategory }).eq("id", data.conversationId);

    if (data.category === "positive") {
      await supabaseAdmin.from("ob_leads").update({ status: "positive" as ObLeadStatus }).eq("id", (conv as any).lead_id);
      // Pause in smartlead
      try {
        const { data: memb } = await supabaseAdmin
          .from("ob_campaign_memberships")
          .select("id, smartlead_lead_id, campaign:ob_campaigns(smartlead_campaign_id)")
          .eq("lead_id", (conv as any).lead_id).eq("status", "active");
        for (const m of memb ?? []) {
          const smcid = (m as any).campaign?.smartlead_campaign_id;
          if (smcid && m.smartlead_lead_id) {
            try {
              await smartleadFetch(`/campaigns/${smcid}/leads/${m.smartlead_lead_id}/pause`, { method: "POST", body: "{}" });
              await supabaseAdmin.from("ob_campaign_memberships").update({ status: "paused" }).eq("id", m.id);
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    } else if (data.category === "not_interested") {
      await supabaseAdmin.from("ob_leads").update({ status: "not_interested" as ObLeadStatus }).eq("id", (conv as any).lead_id);
    } else if (data.category === "meeting_booked") {
      await supabaseAdmin.from("ob_leads").update({ status: "meeting_booked" as ObLeadStatus }).eq("id", (conv as any).lead_id);
    }
    await supabaseAdmin.from("ob_outreach_activities").insert({
      lead_id: (conv as any).lead_id, setter_id: context.userId, type: "status_change" as any, detail: `Category set to ${data.category}`,
    });
    return { ok: true };
  });

export const obQuickAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    leadId: z.string().uuid(),
    action: z.enum(["not_interested","wrong_person","disqualified"]),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead } = await supabaseAdmin.from("ob_leads").select("email, owner_setter_id").eq("id", data.leadId).single();
    if (!lead) throw new Error("Not found");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin && lead.owner_setter_id !== context.userId) throw new Error("Forbidden");

    const statusMap = { not_interested: "not_interested", wrong_person: "disqualified", disqualified: "disqualified" } as const;
    await supabaseAdmin.from("ob_leads").update({ status: statusMap[data.action] as ObLeadStatus }).eq("id", data.leadId);
    if (data.action === "not_interested" && lead.email) {
      await supabaseAdmin.from("ob_suppression_list").insert({ email: lead.email, reason: "do_not_contact" as any });
    }
    await supabaseAdmin.from("ob_outreach_activities").insert({
      lead_id: data.leadId, setter_id: context.userId, type: "status_change" as any, detail: `Quick action: ${data.action}`,
    });
    return { ok: true };
  });
