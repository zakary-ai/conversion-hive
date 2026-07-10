// Server-only: scraper + distribute pipeline.
// Two phases:
//   1. scrape (9:00 AM ET) — scrape ~120% of demand into the pool
//   2. distribute (9:30 AM ET) — recycle uncalled assigned leads, then give
//      each enabled setter exactly LEADS_PER_SETTER fresh leads.
//
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

type Setter = { user_id: string; full_name: string | null };

type CityRun = { city: string; fetched: number; inserted: number; error?: string };

export type ScrapeResult = {
  enabled: boolean;
  skipped: boolean;
  reason: string | null;
  enabledSetters: number;
  scrapeTarget: number;
  fetched: number;
  inserted: number;
  cities: CityRun[];
  errors: string[];
  stopReason?: "target_met" | "city_cap" | "rotation_exhausted" | "no_scrape";
};

export type DistributeResult = {
  recycled: number;
  distributed: number;
  perSetter: Array<{ user_id: string; name: string | null; assigned: number; shortfall: number }>;
  shortfall: number;
  poolAfter: number;
  errors: string[];
};

export type PipelineResult = ScrapeResult & DistributeResult & {
  scrapedThisRun: boolean;
};


export const LEADS_PER_SETTER = 150;
export const SCRAPE_OVERAGE = 1.2;
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

// Returns the UTC ISO string for 00:00:00 America/New_York "today" (DST-aware).
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

async function loadEnabledSetters(): Promise<Setter[]> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "client");
  const clientIds = (roles ?? []).map((r) => r.user_id as string);
  if (clientIds.length === 0) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, full_name, scraper_enabled")
    .in("user_id", clientIds);
  return (profiles ?? [])
    .filter((p) => (p as { scraper_enabled?: boolean }).scraper_enabled !== false)
    .map((p) => ({
      user_id: p.user_id as string,
      full_name: (p.full_name as string | null) ?? null,
    }));
}

async function alreadyRanToday(phase: "scrape" | "distribute"): Promise<boolean> {
  const since = startOfTodayET();
  const { data } = await supabaseAdmin
    .from("scraper_runs")
    .select("id")
    .eq("phase", phase)
    .eq("status", "success")
    .gte("ran_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ---------------- SCRAPE PHASE ----------------

export async function runScrapePhase(opts: { triggeredBy: string; manual?: boolean; skipIfRanToday?: boolean; targetCount?: number }): Promise<ScrapeResult> {
  const errors: string[] = [];
  const result: ScrapeResult = {
    enabled: false,
    skipped: false,
    reason: null,
    enabledSetters: 0,
    scrapeTarget: 0,
    fetched: 0,
    inserted: 0,
    cities: [],
    errors,
  };

  try {
    if (opts.skipIfRanToday && (await alreadyRanToday("scrape"))) {
      result.skipped = true;
      result.reason = "already_ran_today";
      return result;
    }

    const { data: settings, error: sErr } = await supabaseAdmin
      .from("scraper_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settings) {
      result.skipped = true;
      result.reason = "no_settings";
      return result;
    }
    if (!settings.enabled && !opts.manual) {
      result.skipped = true;
      result.reason = "disabled";
      return result;
    }
    result.enabled = true;

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

    const setters = await loadEnabledSetters();
    result.enabledSetters = setters.length;
    result.scrapeTarget = typeof opts.targetCount === "number" && opts.targetCount > 0
      ? Math.ceil(opts.targetCount)
      : Math.ceil(setters.length * LEADS_PER_SETTER * SCRAPE_OVERAGE);

    if (result.scrapeTarget === 0) {
      result.skipped = true;
      result.reason = setters.length === 0 ? "no_enabled_setters" : "no_target";
      return result;
    }


    if (!actorId || cityRotation.length === 0) {
      result.stopReason = "no_scrape";
      errors.push("missing apify actor or city rotation");
      return result;
    }

    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) {
      errors.push("APIFY_TOKEN not configured");
      result.stopReason = "no_scrape";
      return result;
    }

    let cursor = cityIndex;
    let citiesAdvanced = 0;
    const maxCities = Math.min(MAX_CITIES_PER_RUN, cityRotation.length);
    while (result.inserted < result.scrapeTarget && citiesAdvanced < maxCities) {
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

        const phones = new Set<string>();
        const emails = new Set<string>();
        const placeIds = new Set<string>();
        const candidates: Array<{ name: string; phone: string | null; email: string | null; company: string | null; source: string | null; place_id: string }> = [];
        for (const r of raw) {
          const category = String((r as RawLead).categoryName ?? "");
          if (!KITCHEN_RE.test(category)) continue;
          const placeId = (r as RawLead).placeId ? String((r as RawLead).placeId) : "";
          if (!placeId || placeIds.has(placeId)) continue;
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

    if (result.inserted >= result.scrapeTarget) result.stopReason = "target_met";
    else if (citiesAdvanced >= MAX_CITIES_PER_RUN) result.stopReason = "city_cap";
    else result.stopReason = "rotation_exhausted";

    try {
      await supabaseAdmin
        .from("scraper_settings")
        .update({ city_rotation_index: cursor })
        .eq("id", (settings as { id: string }).id);
    } catch (e) {
      errors.push(`rotation_save: ${(e as Error).message}`);
    }
  } catch (e) {
    errors.push(`fatal: ${(e as Error).message}`);
  } finally {
    try {
      const status = result.skipped ? "skipped" : errors.length === 0 ? "success" : result.inserted > 0 ? "partial" : "failed";
      await supabaseAdmin.from("scraper_runs").insert({
        user_id: opts.triggeredBy,
        leads_added: result.inserted,
        status,
        phase: "scrape",
        details: JSON.parse(JSON.stringify(result)),
      });
    } catch { /* ignore log errors */ }
  }
  return result;
}

// ---------------- DISTRIBUTE PHASE ----------------

export async function runDistributePhase(opts: { triggeredBy: string; manual?: boolean; skipIfRanToday?: boolean }): Promise<DistributeResult> {
  const errors: string[] = [];
  const result: DistributeResult = {
    recycled: 0,
    distributed: 0,
    perSetter: [],
    shortfall: 0,
    poolAfter: 0,
    errors,
  };


  let skipped = false;
  let skipReason: string | null = null;

  try {
    if (opts.skipIfRanToday && (await alreadyRanToday("distribute"))) {
      skipped = true;
      skipReason = "already_ran_today";
      return result;
    }

    const { data: settings } = await supabaseAdmin
      .from("scraper_settings")
      .select("enabled")
      .limit(1)
      .maybeSingle();
    if (!opts.manual && !(settings?.enabled ?? false)) {
      skipped = true;
      skipReason = "disabled";
      return result;
    }

    // 1. Recycle: any New lead assigned before today (ET) goes back to the pool.
    const since = startOfTodayET();
    const { data: stale, error: stErr } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("status", "New")
      .eq("retired", false)
      .eq("do_not_contact", false)
      .not("assigned_user_id", "is", null)
      .lt("assigned_at", since);
    if (stErr) errors.push(`recycle_query: ${stErr.message}`);
    const staleIds = (stale ?? []).map((r) => r.id as string);
    if (staleIds.length > 0) {
      const { error: rErr } = await supabaseAdmin
        .from("leads")
        .update({ assigned_user_id: null, assigned_at: null })
        .in("id", staleIds);
      if (rErr) errors.push(`recycle_update: ${rErr.message}`);
      else result.recycled = staleIds.length;
    }

    // 2. Distribute: top up each enabled setter to LEADS_PER_SETTER for today,
    //    allocating the available pool round-robin so a small pool doesn't get
    //    vacuumed up by whoever comes first.
    const setters = await loadEnabledSetters();
    const nowIso = new Date().toISOString();

    // Per-setter "need" = LEADS_PER_SETTER minus leads already assigned today.
    const setterState: Array<{ setter: Setter; assignedToday: number; need: number }> = [];
    for (const s of setters) {
      const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_user_id", s.user_id)
        .gte("assigned_at", since);
      const assignedToday = count ?? 0;
      const need = Math.max(0, LEADS_PER_SETTER - assignedToday);
      setterState.push({ setter: s, assignedToday, need });
    }
    const totalNeed = setterState.reduce((n, r) => n + r.need, 0);

    if (totalNeed > 0) {
      const { data: pool, error: pErr } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("status", "New")
        .eq("retired", false)
        .eq("do_not_contact", false)
        .is("assigned_user_id", null)
        .order("created_at", { ascending: true })
        .limit(totalNeed);
      if (pErr) errors.push(`pool: ${pErr.message}`);
      const poolIds = (pool ?? []).map((r) => r.id as string);

      // Round-robin: iterate setters repeatedly, hand out one lead at a time
      // until the pool is empty or every setter is topped up.
      const buckets = new Map<string, string[]>();
      for (const r of setterState) buckets.set(r.setter.user_id, []);
      let cursor = 0;
      const remaining = setterState.map((r) => r.need);
      while (cursor < poolIds.length) {
        let handedOutThisRound = 0;
        for (let i = 0; i < setterState.length && cursor < poolIds.length; i++) {
          if (remaining[i] <= 0) continue;
          buckets.get(setterState[i].setter.user_id)!.push(poolIds[cursor++]);
          remaining[i] -= 1;
          handedOutThisRound += 1;
        }
        if (handedOutThisRound === 0) break;
      }

      for (const r of setterState) {
        const ids = buckets.get(r.setter.user_id) ?? [];
        if (ids.length > 0) {
          const { error: aErr } = await supabaseAdmin
            .from("leads")
            .update({ assigned_user_id: r.setter.user_id, assigned_at: nowIso })
            .in("id", ids);
          if (aErr) {
            errors.push(`assign(${r.setter.user_id}): ${aErr.message}`);
            result.perSetter.push({ user_id: r.setter.user_id, name: r.setter.full_name, assigned: 0, shortfall: r.need });
            continue;
          }
          result.distributed += ids.length;
        }
        result.perSetter.push({
          user_id: r.setter.user_id,
          name: r.setter.full_name,
          assigned: ids.length,
          shortfall: Math.max(0, r.need - ids.length),
        });
      }
    } else {
      for (const r of setterState) {
        result.perSetter.push({
          user_id: r.setter.user_id,
          name: r.setter.full_name,
          assigned: 0,
          shortfall: 0,
        });
      }
    }


    result.shortfall = result.perSetter.reduce((sum, p) => sum + p.shortfall, 0);
    result.poolAfter = await countAvailablePool();

  } catch (e) {
    errors.push(`fatal: ${(e as Error).message}`);
  } finally {
    try {
      const status = skipped
        ? "skipped"
        : errors.length === 0
          ? "success"
          : result.distributed > 0 || result.recycled > 0
            ? "partial"
            : "failed";
      await supabaseAdmin.from("scraper_runs").insert({
        user_id: opts.triggeredBy,
        leads_added: 0,
        status,
        phase: "distribute",
        details: JSON.parse(JSON.stringify({ ...result, skipped, reason: skipReason })),
      });
    } catch { /* ignore log errors */ }
  }
  return result;
}

// ---------------- DAILY CYCLE ----------------
// 1. Scrape first — target = (setters × LEADS_PER_SETTER × 1.2) − current pool.
// 2. Recycle + distribute once the scrape has populated the pool.

export async function runDailyCycle(opts: { triggeredBy: string; manual?: boolean; skipIfRanToday?: boolean }): Promise<PipelineResult> {
  const manual = opts.manual ?? false;

  // Skip guard on the orchestrator itself (manual "Run now" bypasses).
  if (opts.skipIfRanToday && !manual && (await alreadyRanToday("distribute"))) {
    return {
      enabled: false, skipped: true, reason: "already_ran_today",
      enabledSetters: 0, scrapeTarget: 0, fetched: 0, inserted: 0, cities: [],
      recycled: 0, distributed: 0, perSetter: [], shortfall: 0, poolAfter: 0,
      scrapedThisRun: false, errors: [],
    };
  }

  // Phase 1: scrape 120% of total demand, minus whatever's already in the pool.
  const setters = await loadEnabledSetters();
  const totalDemand = Math.ceil(setters.length * LEADS_PER_SETTER * SCRAPE_OVERAGE);
  const poolBefore = await countAvailablePool();
  const scrapeTarget = Math.max(0, totalDemand - poolBefore);

  let scrape: ScrapeResult;
  if (scrapeTarget > 0) {
    scrape = await runScrapePhase({ triggeredBy: opts.triggeredBy, manual: true, targetCount: scrapeTarget });
  } else {
    scrape = {
      enabled: false, skipped: true, reason: "pool_already_sufficient",
      enabledSetters: setters.length, scrapeTarget: 0,
      fetched: 0, inserted: 0, cities: [], errors: [],
    };
  }

  // Phase 2: recycle + distribute from the (now-topped-up) pool.
  const dist = await runDistributePhase({ triggeredBy: opts.triggeredBy, manual });

  return {
    ...scrape,
    recycled: dist.recycled,
    distributed: dist.distributed,
    perSetter: dist.perSetter,
    shortfall: dist.shortfall,
    poolAfter: dist.poolAfter,
    scrapedThisRun: scrape.inserted > 0 || scrape.fetched > 0,
    errors: [...scrape.errors, ...dist.errors],
  };
}

// ---------------- MANUAL "Run now" — full end-to-end ----------------

export async function runScraperPipeline(opts: { triggeredBy: string; manual?: boolean }): Promise<PipelineResult> {
  return runDailyCycle({ triggeredBy: opts.triggeredBy, manual: opts.manual ?? true });
}

