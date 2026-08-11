import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROJECT_BASE = "https://project--77a6d453-2ccb-4bdc-b7a5-7900dd491db2.lovable.app";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

// ---------- Admin: connection status + webhook URL ----------
export const justcallStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const hasApi = Boolean(process.env["JUSTCALL_API_KEY"] && process.env["JUSTCALL_API_SECRET"]);
    const token = process.env["JUSTCALL_WEBHOOK_SECRET"] ?? "";
    const webhookUrl = token
      ? `${PROJECT_BASE}/api/public/hooks/justcall?t=${encodeURIComponent(token)}`
      : null;

    let agents: Array<{ id: string; name: string; email: string | null; numbers: string[] }> = [];
    let error: string | null = null;
    if (hasApi) {
      const { jcListAgents } = await import("@/lib/justcall.server");
      const res = await jcListAgents();
      agents = res.agents;
      error = res.error;
    }
    return { hasApi, webhookUrl, agents, error };
  });

// ---------- Admin: setter ↔ JustCall agent mapping ----------
export const justcallListSetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "b2b_setter");
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, email, justcall_agent_id, justcall_agent_email, justcall_number_e164")
      .in("user_id", ids)
      .order("full_name");
    return profiles ?? [];
  });

export const justcallSetSetterMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      user_id: z.string().uuid(),
      agent_id: z.string().max(120).nullable(),
      agent_email: z.string().max(200).nullable(),
      number_e164: z.string().max(40).nullable(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        justcall_agent_id: data.agent_id || null,
        justcall_agent_email: data.agent_email || null,
        justcall_number_e164: data.number_e164 || null,
      } as never)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Setter: my JustCall mapping ----------
export const myJustcallMapping = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("full_name, email, justcall_agent_id, justcall_agent_email, justcall_number_e164")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      connected: Boolean((data as any)?.justcall_agent_id || (data as any)?.justcall_agent_email),
      agent_id: (data as any)?.justcall_agent_id ?? null,
      agent_email: (data as any)?.justcall_agent_email ?? null,
      number: (data as any)?.justcall_number_e164 ?? null,
      full_name: data?.full_name ?? null,
      email: data?.email ?? null,
    };
  });

// ---------- Push leads into this setter's JustCall dialer campaign ----------
export const pushLeadsToDialer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      pool_lead_ids: z.array(z.string().uuid()).max(1000).optional(),
      all_claimed: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, justcall_agent_id")
      .eq("user_id", userId)
      .maybeSingle();

    let q = supabase
      .from("b2b_lead_pool")
      .select("id, first_name, last_name, company, phone, email, notes, status")
      .eq("claimed_by", userId)
      .eq("archived", false)
      .eq("status", "claimed" as any)
      .not("phone", "is", null)
      .neq("phone", "");
    if (data.pool_lead_ids?.length) q = q.in("id", data.pool_lead_ids);
    else if (!data.all_claimed) throw new Error("Nothing selected to push.");

    const { data: leads, error } = await q.limit(1000);
    if (error) throw new Error(error.message);
    if (!leads?.length) return { pushed: 0, skipped: 0, campaign: null as string | null, error: null as string | null };

    const {
      jcListCampaigns, jcCreateCampaign, jcAddContacts, toE164,
    } = await import("@/lib/justcall.server");

    const campaignName = `Conversion Lab — ${profile?.full_name || profile?.email || userId.slice(0, 8)}`;
    const { campaigns, error: listErr } = await jcListCampaigns();
    if (listErr) throw new Error(`JustCall: ${listErr}`);
    let campaign = campaigns.find((c) => c.name === campaignName)?.id ?? null;
    if (!campaign) {
      const created = await jcCreateCampaign(campaignName, (profile as any)?.justcall_agent_id ?? null);
      if (created.error) throw new Error(`JustCall: ${created.error}`);
      campaign = created.id;
    }
    if (!campaign) throw new Error("Could not create a JustCall dialer campaign.");

    // Dedupe by last-10 digits within this push.
    const seen = new Set<string>();
    const contacts = [] as Array<{ first_name: string | null; last_name: string | null; phone: string; email: string | null; company: string | null; notes: string | null }>;
    let skipped = 0;
    for (const l of leads) {
      const d = (l.phone ?? "").replace(/\D/g, "").slice(-10);
      if (!d || seen.has(d)) { skipped++; continue; }
      seen.add(d);
      contacts.push({
        first_name: l.first_name,
        last_name: l.last_name,
        phone: toE164(l.phone!),
        email: l.email,
        company: l.company,
        notes: l.notes,
      });
    }

    const { added, error: addErr } = await jcAddContacts(campaign, contacts);
    return { pushed: added, skipped, campaign: campaignName, error: addErr };
  });

// ---------- Setter: click-to-call through JustCall ----------
export const justcallDialLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pool_lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: lead } = await context.supabase
      .from("b2b_lead_pool")
      .select("id, phone, claimed_by")
      .eq("id", data.pool_lead_id)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");
    if (!lead.phone) throw new Error("Lead has no phone number");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("justcall_agent_id, justcall_number_e164")
      .eq("user_id", context.userId)
      .maybeSingle();
    const agentId = (profile as any)?.justcall_agent_id as string | null;
    if (!agentId) throw new Error("Your JustCall agent isn't linked yet — ask an admin to map your account.");

    const { jcClickToCall, toE164 } = await import("@/lib/justcall.server");
    const res = await jcClickToCall({
      agentId,
      contactNumber: toE164(lead.phone),
      justcallNumber: (profile as any)?.justcall_number_e164 ?? null,
    });
    if (!res.ok) throw new Error(`JustCall: ${res.error ?? "call failed"}`);
    return { ok: true };
  });

// ---------- Setter: current live call (polling fallback for the screen pop) ----------
export const getMyLiveCall = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await (context.supabase as any)
      .from("b2b_live_calls")
      .select("*")
      .eq("setter_id", context.userId)
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data ?? null) as any;
  });

// ---------- Setter: recent live-call history for the dialer session ----------
export const listMyRecentLiveCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sinceIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data } = await (context.supabase as any)
      .from("b2b_live_calls")
      .select("*")
      .eq("setter_id", context.userId)
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false })
      .limit(25);
    return (data ?? []) as any[];
  });
