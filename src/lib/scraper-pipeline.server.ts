// Server-only: runs the daily scraper + distribute pipeline.
// Uses supabaseAdmin (bypasses RLS) — only callable from server fns / server routes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RawLead = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  source?: string | null;
  [k: string]: unknown;
};

type Setter = { user_id: string; full_name: string | null; daily_lead_quota: number };

export type PipelineResult = {
  enabled: boolean;
  skipped: boolean;
  reason: string | null;
  recycled: number;
  fetched: number;
  inserted: number;
  distributed: number;
  perSetter: Array<{ user_id: string; name: string | null; needed: number; assigned: number; shortfall: number }>;
  errors: string[];
};

function pickField(row: RawLead, key: string | undefined, fallback: string): unknown {
  if (key && key in row) return row[key];
  return row[fallback];
}

async function callApify(actorId: string, input: Record<string, unknown>, token: string): Promise<RawLead[]> {
  if (!actorId) return [];
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input || {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify call failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("Apify returned non-array dataset");
  return data as RawLead[];
}

// Pull current unassigned-New pool ids (oldest first), then assign to setters
// up to each setter's remaining shortfall. Returns total assigned across all setters
// plus the updated assigned-count map.
async function distributePool(
  setters: Setter[],
  haveByUser: Map<string, number>,
  errors: string[],
): Promise<{ assignedTotal: number; assignedByUser: Map<string, number> }> {
  const { data: pool } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("status", "New")
    .eq("retired", false)
    .eq("do_not_contact", false)
    .is("assigned_user_id", null)
    .order("created_at", { ascending: true });

  const poolIds = (pool ?? []).map((r) => r.id as string);
  let poolIdx = 0;
  let assignedTotal = 0;
  const assignedByUser = new Map<string, number>();

  for (const s of setters) {
    const have = haveByUser.get(s.user_id) ?? 0;
    const need = Math.max(0, s.daily_lead_quota - have);
    if (need === 0) continue;
    const take = poolIds.slice(poolIdx, poolIdx + need);
    poolIdx += take.length;
    if (take.length === 0) continue;
    const { error: aErr } = await supabaseAdmin
      .from("leads")
      .update({ assigned_user_id: s.user_id })
      .in("id", take);
    if (aErr) {
      errors.push(`assign(${s.user_id}): ${aErr.message}`);
      continue;
    }
    assignedTotal += take.length;
    assignedByUser.set(s.user_id, take.length);
    haveByUser.set(s.user_id, have + take.length);
  }

  return { assignedTotal, assignedByUser };
}

export async function runScraperPipeline(opts: { triggeredBy: string; manual?: boolean }): Promise<PipelineResult> {
  const errors: string[] = [];
  const result: PipelineResult = {
    enabled: false,
    skipped: false,
    reason: null,
    recycled: 0,
    fetched: 0,
    inserted: 0,
    distributed: 0,
    perSetter: [],
    errors,
  };

  // 1. Settings
  const { data: settings, error: sErr } = await supabaseAdmin
    .from("scraper_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!settings) return result;
  // `enabled` gates the daily cron only. Manual "Run now" always proceeds.
  if (!settings.enabled && !opts.manual) return result;
  result.enabled = true;
  const recycleDays = (settings.recycle_days as number) ?? 3;
  const batchSize = (settings.batch_size as number) ?? 200;
  const fieldMap = (settings.field_map as Record<string, string>) ?? {};
  const apifyInput: Record<string, unknown> = { ...((settings.apify_input as Record<string, unknown>) ?? {}) };
  const actorId = (settings.apify_actor_id as string) ?? "";

  // City rotation: pick the next city in the list, overriding locationQuery.
  // The cursor only advances after a real Apify call (skip days don't burn a city).
  const cityRotation = ((settings as { city_rotation?: string[] }).city_rotation ?? []).filter((c) => typeof c === "string" && c.trim().length > 0);
  const cityIndex = ((settings as { city_rotation_index?: number }).city_rotation_index ?? 0) | 0;
  let cityUsed: string | null = null;
  let nextCityIndex = cityIndex;
  if (cityRotation.length > 0) {
    const i = ((cityIndex % cityRotation.length) + cityRotation.length) % cityRotation.length;
    cityUsed = cityRotation[i];
    apifyInput.locationQuery = cityUsed;
    nextCityIndex = (i + 1) % cityRotation.length;
  }

  // 2. Enabled setters
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").eq("role", "client");
  const clientIds = (roles ?? []).map((r) => r.user_id as string);
  if (clientIds.length === 0) return result;

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, full_name, scraper_enabled, daily_lead_quota")
    .in("user_id", clientIds);

  const setters: Setter[] = (profiles ?? [])
    .filter((p) => (p as { scraper_enabled?: boolean }).scraper_enabled !== false)
    .map((p) => ({
      user_id: p.user_id as string,
      full_name: (p.full_name as string | null) ?? null,
      daily_lead_quota: ((p as { daily_lead_quota?: number }).daily_lead_quota as number) ?? 75,
    }));

  if (setters.length === 0) return result;

  // 3. Recycle stale No-Answer leads
  const cutoff = new Date(Date.now() - recycleDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: recyclable } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("status", "No Answer")
    .eq("retired", false)
    .eq("do_not_contact", false)
    .lt("last_status_change_at", cutoff);

  const recycleIds = (recyclable ?? []).map((r) => r.id as string);
  if (recycleIds.length > 0) {
    const { error: recErr } = await supabaseAdmin
      .from("leads")
      .update({ status: "New", assigned_user_id: null })
      .in("id", recycleIds);
    if (recErr) errors.push(`recycle: ${recErr.message}`);
    else result.recycled = recycleIds.length;
  }

  // 4. Initial per-setter "New" counts
  const { data: newLeads } = await supabaseAdmin
    .from("leads")
    .select("id, assigned_user_id")
    .eq("status", "New");
  const haveByUser = new Map<string, number>();
  for (const l of newLeads ?? []) {
    const u = (l.assigned_user_id as string | null) ?? null;
    if (u) haveByUser.set(u, (haveByUser.get(u) ?? 0) + 1);
  }

  // Snapshot original need per setter (for reporting)
  const originalNeed = new Map<string, number>();
  for (const s of setters) {
    originalNeed.set(s.user_id, Math.max(0, s.daily_lead_quota - (haveByUser.get(s.user_id) ?? 0)));
  }

  // 5. Distribute the existing pool FIRST
  const pass1 = await distributePool(setters, haveByUser, errors);
  result.distributed += pass1.assignedTotal;

  // 6. Recompute remaining shortfall
  let remainingShortfall = 0;
  for (const s of setters) {
    remainingShortfall += Math.max(0, s.daily_lead_quota - (haveByUser.get(s.user_id) ?? 0));
  }

  // 7. If the pool covered demand, skip scraping entirely.
  if (remainingShortfall === 0) {
    result.skipped = true;
    result.reason = "pool_covered_demand";
    result.perSetter = setters.map((s) => ({
      user_id: s.user_id,
      name: s.full_name,
      needed: originalNeed.get(s.user_id) ?? 0,
      assigned: pass1.assignedByUser.get(s.user_id) ?? 0,
      shortfall: 0,
    }));

    const runDetails = { ...result, city: null, city_skipped: cityUsed } as Record<string, unknown>;
    await supabaseAdmin.from("scraper_runs").insert({
      user_id: opts.triggeredBy,
      leads_added: 0,
      status: "skipped",
      phase: "skipped",
      details: JSON.parse(JSON.stringify(runDetails)),
    });
    return result;
  }

  // 8. Scrape to cover the remaining shortfall
  const assignedByUser = new Map(pass1.assignedByUser);
  if (actorId) {
    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) {
      errors.push("APIFY_TOKEN not configured");
    } else {
      try {
        const wantedBatch = Math.min(Math.max(batchSize, remainingShortfall), 1000);
        const raw = await callApify(
          actorId,
          { ...apifyInput, maxItems: wantedBatch, maxCrawledPlacesPerSearch: wantedBatch },
          apifyToken,
        );
        result.fetched = raw.length;

        // Dedupe within batch and against DB by phone + email
        const phones = new Set<string>();
        const emails = new Set<string>();
        const candidates: Array<{ name: string; phone: string | null; email: string | null; company: string | null; source: string | null }> = [];
        for (const r of raw) {
          const name = String(pickField(r, fieldMap.name, "name") ?? "").trim();
          if (!name) continue;
          let phoneRaw = pickField(r, fieldMap.phone, "phoneUnformatted");
          if (!phoneRaw) phoneRaw = (r as RawLead).phone ?? null;
          let emailRaw = pickField(r, fieldMap.email, "emails");
          if (Array.isArray(emailRaw)) emailRaw = emailRaw[0] ?? null;
          const company = (pickField(r, fieldMap.company, "categoryName") as string | null | undefined) || null;
          const source = (pickField(r, fieldMap.source, "url") as string | null | undefined) || "apify";
          const phone = phoneRaw ? String(phoneRaw).replace(/[^\d+]/g, "") || null : null;
          const email = emailRaw ? String(emailRaw).trim().toLowerCase() || null : null;
          if (phone && phones.has(phone)) continue;
          if (email && emails.has(email)) continue;
          if (phone) phones.add(phone);
          if (email) emails.add(email);
          candidates.push({ name: name.slice(0, 200), phone: phone?.slice(0, 50) ?? null, email: email?.slice(0, 200) ?? null, company: company?.slice(0, 200) ?? null, source: source?.slice(0, 120) ?? null });
        }

        const phoneList = [...phones];
        const emailList = [...emails];
        const existing = new Set<string>();
        if (phoneList.length > 0) {
          const { data } = await supabaseAdmin.from("leads").select("phone").in("phone", phoneList);
          for (const r of data ?? []) if (r.phone) existing.add("p:" + r.phone);
        }
        if (emailList.length > 0) {
          const { data } = await supabaseAdmin.from("leads").select("email").in("email", emailList);
          for (const r of data ?? []) if (r.email) existing.add("e:" + r.email);
        }

        const toInsert = candidates.filter((c) =>
          !(c.phone && existing.has("p:" + c.phone)) &&
          !(c.email && existing.has("e:" + c.email))
        ).map((c) => ({ ...c, status: "New" as const, assigned_user_id: null }));

        if (toInsert.length > 0) {
          const { error: insErr } = await supabaseAdmin.from("leads").insert(toInsert);
          if (insErr) errors.push(`insert: ${insErr.message}`);
          else result.inserted = toInsert.length;
        }
      } catch (e) {
        errors.push(`scrape: ${(e as Error).message}`);
      }
    }
  }

  // 9. Second distribution pass for the freshly inserted leads
  if (result.inserted > 0) {
    const pass2 = await distributePool(setters, haveByUser, errors);
    result.distributed += pass2.assignedTotal;
    for (const [uid, n] of pass2.assignedByUser) {
      assignedByUser.set(uid, (assignedByUser.get(uid) ?? 0) + n);
    }
  }

  // 10. Build per-setter report
  result.perSetter = setters.map((s) => {
    const need = originalNeed.get(s.user_id) ?? 0;
    const assigned = assignedByUser.get(s.user_id) ?? 0;
    return {
      user_id: s.user_id,
      name: s.full_name,
      needed: need,
      assigned,
      shortfall: Math.max(0, need - assigned),
    };
  });

  // 11. Advance city rotation cursor only if we actually attempted Apify.
  if (cityUsed && actorId) {
    await supabaseAdmin
      .from("scraper_settings")
      .update({ city_rotation_index: nextCityIndex })
      .eq("id", (settings as { id: string }).id);
  }

  // 12. Log run
  const runDetails = { ...result, city: cityUsed } as Record<string, unknown>;
  await supabaseAdmin.from("scraper_runs").insert({
    user_id: opts.triggeredBy,
    leads_added: result.inserted,
    status: errors.length === 0 ? "success" : (result.distributed > 0 ? "partial" : "failed"),
    phase: "full",
    details: JSON.parse(JSON.stringify(runDetails)),
  });

  return result;
}
