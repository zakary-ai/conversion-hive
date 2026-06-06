import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) throw new Error("Forbidden");
}

export const getScraperSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("scraper_settings").select("*").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const SettingsInput = z.object({
  enabled: z.boolean().optional(),
  apify_actor_id: z.string().max(200).optional(),
  apify_input: z.record(z.string(), z.unknown()).optional(),
  batch_size: z.number().int().min(1).max(1000).optional(),
  field_map: z.record(z.string(), z.string().max(80)).optional(),
  recycle_days: z.number().int().min(1).max(60).optional(),
  city_rotation: z.array(z.string().min(1).max(200)).max(1000).optional(),
  city_rotation_index: z.number().int().min(0).optional(),
});


export const updateScraperSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SettingsInput.parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    const table = (supabaseAdmin as unknown as { from: (t: string) => { select: (c: string) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } }; insert: (v: unknown) => Promise<{ error: { message: string } | null }>; update: (v: unknown) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } } }).from("scraper_settings");
    const { data: row } = await table.select("id").limit(1).maybeSingle();
    if (!row) {
      const { error } = await table.insert(payload);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await table.update(payload).eq("id", row.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listScraperSetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "client");
    const ids = (roles ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, email, scraper_enabled, daily_lead_quota")
      .in("user_id", ids);
    const { data: newLeads } = await supabaseAdmin
      .from("leads")
      .select("assigned_user_id")
      .eq("status", "New")
      .in("assigned_user_id", ids);
    const counts = new Map<string, number>();
    for (const l of newLeads ?? []) {
      const u = l.assigned_user_id as string | null;
      if (u) counts.set(u, (counts.get(u) ?? 0) + 1);
    }
    return (profiles ?? []).map((p) => ({
      user_id: p.user_id as string,
      full_name: (p.full_name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      scraper_enabled: (p as { scraper_enabled?: boolean }).scraper_enabled ?? true,
      daily_lead_quota: ((p as { daily_lead_quota?: number }).daily_lead_quota as number) ?? 75,
      current_new: counts.get(p.user_id as string) ?? 0,
    }));
  });

export const updateSetterScraperConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    user_id: z.string().uuid(),
    scraper_enabled: z.boolean().optional(),
    daily_lead_quota: z.number().int().min(0).max(1000).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { user_id, ...rest } = data;
    const { error } = await supabaseAdmin.from("profiles").update(rest).eq("user_id", user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runScraperNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { runScraperPipeline } = await import("@/lib/scraper-pipeline.server");
    return runScraperPipeline({ triggeredBy: context.userId });
  });

export const skipNextCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("scraper_settings").select("id, city_rotation, city_rotation_index").limit(1).maybeSingle();
    if (!row) return { ok: true };
    const list = ((row as { city_rotation?: string[] }).city_rotation ?? []).filter((c) => typeof c === "string" && c.trim().length > 0);
    if (list.length === 0) return { ok: true };
    const current = ((row as { city_rotation_index?: number }).city_rotation_index ?? 0) | 0;
    const next = (((current + 1) % list.length) + list.length) % list.length;
    const { error } = await supabaseAdmin.from("scraper_settings").update({ city_rotation_index: next }).eq("id", (row as { id: string }).id);
    if (error) throw new Error(error.message);
    return { ok: true, next_index: next, next_city: list[next] };
  });


export const listScraperRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("scraper_runs")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });
