// Server-only: runs the daily scraper + distribute pipeline.
// Uses supabaseAdmin (bypasses RLS) — only callable from server fns / server routes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RawLead = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  source?: string | null;
  categoryName?: string | null;
  placeId?: string | null;
  [k: string]: unknown;
};

type Setter = { user_id: string; full_name: string | null; daily_lead_quota: number };

type CityRun = { city: string; fetched: number; inserted: number; error?: string };

export type PipelineResult = {
  enabled: boolean;
  skipped: boolean;
  reason: string | null;
  recycled: number;
  fetched: number;
  inserted: number;
  distributed: number;
  requiredToday: number;
  availablePool: number;
  shortfall: number;
  scrapeTarget: number;
  cities: CityRun[];
  perSetter: Array<{ user_id: string; name: string | null; needed: number; assigned: number; shortfall: number }>;
  errors: string[];
  quotaMet?: boolean;
  unfilled?: number;
  stopReason?: "target_met" | "city_cap" | "rotation_exhausted" | "no_scrape";
  warnings?: string[];
};

const KITCHEN_RE = /kitchen\s+(remodel|renovat)/i;
const MAX_CITIES_PER_RUN = 8;

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

// Returns the UTC ISO string corresponding to 00:00:00 America/New_York "today".
// DST-aware via Intl (no fixed offset).
export function startOfTodayET(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const etAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offsetMs = etAsUtc - now.getTime();
  const etMidnightAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return new Date(etMidnightAsUtc - offsetMs).toISOString();
}

async function loadLeadsTodayByUser(userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  const since = startOfTodayET();
  const { data } = await supabaseAdmin
    .from("leads")
    .select("assigned_user_id")
    .gte("assigned_at", since)
    .in("assigned_user_id", userIds);
  for (const r of data ?? []) {
    const u = r.assigned_user_id as string | null;
    if (u) map.set(u, (map.get(u) ?? 0) + 1);
  }
  return map;
}

async function countAvailablePool(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "New")
    .eq("retired", false)
    .eq("do_not_contact", false)
    .is("assigned_user_id", null);
  return count ?? 0;
}

// Round-robin distribute: each enabled setter gets 1 lead at a time from
// the oldest-first pool until their `capacity` runs out or pool is empty.
async function distributeRoundRobin(
  setters: Setter[],
  capacity: Map<string, number>,
  errors: string[],
): Promise<{ assignedTotal: number; assignedByUser: Map<string, number> }> {
  const assignedByUser = new Map<string, number>();
  let assignedTotal = 0;

  const totalCap = setters.reduce((a, s) => a + (capacity.get(s.user_id) ?? 0), 0);
  if (totalCap === 0) return { assignedTotal, assignedByUser };

  const { data: pool } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("status", "New")
    .eq("retired", false)
    .eq("do_not_contact", false)
    .is("assigned_user_id", null)
    .order("created_at", { ascending: true })
    .limit(totalCap);

  const poolIds = (pool ?? []).map((r) => r.id as string);
  if (poolIds.length === 0) return { assignedTotal, assignedByUser };

  // Build per-setter id buckets via round-robin
  const buckets = new Map<string, string[]>();
  for (const s of setters) buckets.set(s.user_id, []);
  let i = 0;
  while (i < poolIds.length) {
    let placedThisLap = 0;
    for (const s of setters) {
      const remaining = capacity.get(s.user_id) ?? 0;
      if (remaining <= 0) continue;
      if (i >= poolIds.length) break;
      buckets.get(s.user_id)!.push(poolIds[i]);
      capacity.set(s.user_id, remaining - 1);
      i += 1;
      placedThisLap += 1;
    }
    if (placedThisLap === 0) break;
  }

  const nowIso = new Date().toISOString();
  for (const s of setters) {
    const ids = buckets.get(s.user_id) ?? [];
    if (ids.length === 0) continue;
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ assigned_user_id: s.user_id, assigned_at: nowIso })
      .in("id", ids);
    if (error) {
      errors.push(`assign(${s.user_id}): ${error.message}`);
      continue;
    }
    assignedByUser.set(s.user_id, ids.length);
    assignedTotal += ids.length;
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
    requiredToday: 0,
    availablePool: 0,
    shortfall: 0,
    scrapeTarget: 0,
    cities: [],
    perSetter: [],
    errors,
  };

  try {
    return await runPipelineInner(opts, result, errors);
  } catch (e) {
    errors.push(`fatal: ${(e as Error).message}`);
    // Best-effort distribution so setters still get leads even if scrape blew up.
    try {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "client");
      const clientIds = (roles ?? []).map((r) => r.user_id as string);
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
      if (setters.length > 0) {
        const leadsToday = await loadLeadsTodayByUser(setters.map((s) => s.user_id));
        const cap = new Map<string, number>();
        for (const s of setters) cap.set(s.user_id, Math.max(0, s.daily_lead_quota - (leadsToday.get(s.user_id) ?? 0)));
        const rescue = await distributeRoundRobin(setters, cap, errors);
        result.distributed += rescue.assignedTotal;
      }
    } catch (e2) {
      errors.push(`rescue_distribute: ${(e2 as Error).message}`);
    }
    return result;
  } finally {
    try {
      const status = result.skipped
        ? "skipped"
        : errors.length === 0
          ? "success"
          : result.distributed > 0 || result.inserted > 0
            ? "partial"
            : "failed";
      await supabaseAdmin.from("scraper_runs").insert({
        user_id: opts.triggeredBy,
        leads_added: result.inserted,
        status,
        phase: result.skipped ? "skipped" : "full",
        details: JSON.parse(JSON.stringify(result)),
      });
    } catch {
      // Swallow logging errors so they don't mask the original failure.
    }
  }
}

async function runPipelineInner(
  opts: { triggeredBy: string; manual?: boolean },
  result: PipelineResult,
  errors: string[],
): Promise<PipelineResult> {

  // 1. Settings
  const { data: settings, error: sErr } = await supabaseAdmin
    .from("scraper_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!settings) return result;
  if (!settings.enabled && !opts.manual) return result;
  result.enabled = true;

  const recycleDays = (settings.recycle_days as number) ?? 3;
  const batchSize = (settings.batch_size as number) ?? 200;
  const fieldMap = (settings.field_map as Record<string, string>) ?? {};
  const apifyInputBase: Record<string, unknown> = { ...((settings.apify_input as Record<string, unknown>) ?? {}) };
  const actorId = (settings.apify_actor_id as string) ?? "";

  const cityRotation = ((settings as { city_rotation?: string[] }).city_rotation ?? [])
    .filter((c) => typeof c === "string" && c.trim().length > 0);
  let cityIndex = (((settings as { city_rotation_index?: number }).city_rotation_index ?? 0) | 0);
  if (cityRotation.length > 0) {
    cityIndex = ((cityIndex % cityRotation.length) + cityRotation.length) % cityRotation.length;
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

  // 3. Recycle stale No-Answer leads (back into unassigned pool)
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

  // 4. Compute demand
  const leadsTodayByUser = await loadLeadsTodayByUser(setters.map((s) => s.user_id));
  const originalCapacity = new Map<string, number>();
  for (const s of setters) {
    originalCapacity.set(s.user_id, Math.max(0, s.daily_lead_quota - (leadsTodayByUser.get(s.user_id) ?? 0)));
  }
  const requiredToday = setters.reduce((a, s) => a + (originalCapacity.get(s.user_id) ?? 0), 0);
  const availablePool = await countAvailablePool();
  const shortfall = Math.max(0, requiredToday - availablePool);
  const scrapeTarget = Math.ceil(shortfall * 1.2);
  result.requiredToday = requiredToday;
  result.availablePool = availablePool;
  result.shortfall = shortfall;
  result.scrapeTarget = scrapeTarget;

  // 5. Working capacity (mutated by distribution)
  const capacity = new Map(originalCapacity);
  const assignedByUser = new Map<string, number>();
  const bumpAssigned = (m: Map<string, number>) => {
    for (const [u, n] of m) assignedByUser.set(u, (assignedByUser.get(u) ?? 0) + n);
  };

  // 6. First distribution pass (drain existing pool)
  const pass1 = await distributeRoundRobin(setters, capacity, errors);
  result.distributed += pass1.assignedTotal;
  bumpAssigned(pass1.assignedByUser);

  // 7. Scrape across multiple cities if still needed
  let citiesAdvanced = 0;
  let stopReason: "target_met" | "city_cap" | "rotation_exhausted" | "no_scrape" = "no_scrape";
  let cursor = cityIndex;
  if (scrapeTarget > 0 && actorId && cityRotation.length > 0) {
    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) {
      errors.push("APIFY_TOKEN not configured");
      stopReason = "no_scrape";
    } else {
      let insertedSoFar = 0;
      const maxCities = Math.min(MAX_CITIES_PER_RUN, cityRotation.length);
      while (insertedSoFar < scrapeTarget && citiesAdvanced < maxCities) {
        const city = cityRotation[cursor];
        const cityRun: CityRun = { city, fetched: 0, inserted: 0 };
        try {
          const input = {
            ...apifyInputBase,
            locationQuery: city,
            maxItems: batchSize,
            maxCrawledPlacesPerSearch: batchSize,
          };
          const raw = await callApify(actorId, input, apifyToken);
          cityRun.fetched = raw.length;
          result.fetched += raw.length;

          // Filter + normalize
          const phones = new Set<string>();
          const emails = new Set<string>();
          const placeIds = new Set<string>();
          const candidates: Array<{ name: string; phone: string | null; email: string | null; company: string | null; source: string | null; place_id: string }> = [];
          for (const r of raw) {
            const category = String((r as RawLead).categoryName ?? "");
            if (!KITCHEN_RE.test(category)) continue;
            const placeId = (r as RawLead).placeId ? String((r as RawLead).placeId) : "";
            if (!placeId) continue;
            if (placeIds.has(placeId)) continue;

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
            placeIds.add(placeId);
            candidates.push({
              name: name.slice(0, 200),
              phone: phone?.slice(0, 50) ?? null,
              email: email?.slice(0, 200) ?? null,
              company: company?.slice(0, 200) ?? null,
              source: source?.slice(0, 120) ?? null,
              place_id: placeId.slice(0, 200),
            });
          }

          // DB-side dedupe (placeId is primary)
          const existing = new Set<string>();
          const placeList = [...placeIds];
          if (placeList.length > 0) {
            const { data } = await supabaseAdmin.from("leads").select("place_id").in("place_id", placeList);
            for (const r of data ?? []) if (r.place_id) existing.add("pid:" + r.place_id);
          }
          const phoneList = [...phones];
          if (phoneList.length > 0) {
            const { data } = await supabaseAdmin.from("leads").select("phone").in("phone", phoneList);
            for (const r of data ?? []) if (r.phone) existing.add("p:" + r.phone);
          }
          const emailList = [...emails];
          if (emailList.length > 0) {
            const { data } = await supabaseAdmin.from("leads").select("email").in("email", emailList);
            for (const r of data ?? []) if (r.email) existing.add("e:" + r.email);
          }

          const toInsert = candidates
            .filter((c) =>
              !existing.has("pid:" + c.place_id) &&
              !(c.phone && existing.has("p:" + c.phone)) &&
              !(c.email && existing.has("e:" + c.email)),
            )
            .map((c) => ({ ...c, status: "New" as const, assigned_user_id: null }));

          if (toInsert.length > 0) {
            // ON CONFLICT (place_id) DO NOTHING — ignoreDuplicates prevents a racing
            // duplicate place_id from aborting the entire batch.
            const { data: inserted, error: insErr } = await supabaseAdmin
              .from("leads")
              .upsert(toInsert, { onConflict: "place_id", ignoreDuplicates: true })
              .select("id");
            if (insErr) {
              cityRun.error = `insert: ${insErr.message}`;
              errors.push(`insert(${city}): ${insErr.message}`);
            } else {
              const insertedCount = inserted?.length ?? 0;
              cityRun.inserted = insertedCount;
              result.inserted += insertedCount;
              insertedSoFar += insertedCount;
            }
          }
        } catch (e) {
          cityRun.error = (e as Error).message;
          errors.push(`scrape(${city}): ${(e as Error).message}`);
        }
        result.cities.push(cityRun);
        cursor = (cursor + 1) % cityRotation.length;
        citiesAdvanced += 1;
      }

      if (insertedSoFar >= scrapeTarget) stopReason = "target_met";
      else if (citiesAdvanced >= MAX_CITIES_PER_RUN) stopReason = "city_cap";
      else stopReason = "rotation_exhausted";

      // Persist advanced rotation pointer in its own try/catch — a save error
      // must not abort the run or skip the warning / log step below.
      try {
        await supabaseAdmin
          .from("scraper_settings")
          .update({ city_rotation_index: cursor })
          .eq("id", (settings as { id: string }).id);
      } catch (e) {
        errors.push(`rotation_save: ${(e as Error).message}`);
      }
    }
  } else if (scrapeTarget === 0) {
    result.skipped = true;
    result.reason = "pool_covered_demand";
    stopReason = "no_scrape";
  } else {
    // scrapeTarget > 0 but actor or rotation missing
    stopReason = "no_scrape";
  }


  // 8. Second distribution pass for freshly inserted leads
  if (result.inserted > 0) {
    const pass2 = await distributeRoundRobin(setters, capacity, errors);
    result.distributed += pass2.assignedTotal;
    bumpAssigned(pass2.assignedByUser);
  }

  // 9. Per-setter report
  result.perSetter = setters.map((s) => {
    const need = originalCapacity.get(s.user_id) ?? 0;
    const assigned = assignedByUser.get(s.user_id) ?? 0;
    return {
      user_id: s.user_id,
      name: s.full_name,
      needed: need,
      assigned,
      shortfall: Math.max(0, need - assigned),
    };
  });

  // 9b. Quota-fill assessment (separate from status)
  let remainingCapacity = 0;
  for (const v of capacity.values()) remainingCapacity += Math.max(0, v);
  const quotaMet = remainingCapacity === 0;
  result.stopReason = stopReason;
  if (quotaMet) {
    result.quotaMet = true;
  } else {
    result.quotaMet = false;
    result.unfilled = remainingCapacity;
    const inserted = result.inserted;
    const citiesUsed = result.cities.length;
    let msg: string;
    if (stopReason === "city_cap") {
      msg = `Quota short by ${remainingCapacity}: scraped ${citiesUsed}/${MAX_CITIES_PER_RUN} cities (hit city cap), ${inserted} new leads inserted. Raise MAX_CITIES_PER_RUN or add more cities to the rotation.`;
    } else if (stopReason === "rotation_exhausted") {
      msg = `Quota short by ${remainingCapacity}: ran out of cities in rotation (${citiesUsed} scraped), ${inserted} inserted. Add more cities to the rotation.`;
    } else if (stopReason === "no_scrape") {
      msg = `Quota short by ${remainingCapacity}: scraper not configured (missing Apify actor, APIFY_TOKEN, or city rotation).`;
    } else {
      msg = `Quota short by ${remainingCapacity}: pool exhausted before all setters filled (${inserted} inserted across ${citiesUsed} cities). Add more cities or lower a setter's quota.`;
    }
    result.warnings = [msg];
  }

  // Logging is handled by runScraperPipeline's finally block so a thrown
  // error here still writes a scraper_runs row.
  return result;
}

