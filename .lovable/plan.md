# Scraper pipeline corrections

## 1. Migration

```sql
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
CREATE INDEX IF NOT EXISTS leads_assigned_user_assigned_at_idx
  ON public.leads (assigned_user_id, assigned_at)
  WHERE assigned_user_id IS NOT NULL;

-- Convert partial unique index to plain unique index so ON CONFLICT (place_id) works.
DROP INDEX IF EXISTS leads_place_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS leads_place_id_key ON public.leads (place_id);
```

No grant/RLS changes.

## 2. `src/lib/scraper-pipeline.server.ts`

- Replace `startOfTodayET()` with a real `Intl`-based "America/New_York" start-of-day → UTC ISO converter (DST-aware). Export it for reuse.
- `loadLeadsTodayByUser` queries `assigned_at >= since` (was `created_at`).
- `distributeRoundRobin` writes `{ assigned_user_id, assigned_at: new Date().toISOString() }`. Lead status untouched.
- Insert path: `.upsert(toInsert, { onConflict: "place_id", ignoreDuplicates: true }).select("id")` so a duplicate `place_id` can't abort the batch. `inserted` count = returned rows length.
- City loop: each city's Apify call + filter + DB dedupe + insert wrapped in `try/catch` → push `cityRun.error`, append to `errors`, continue. `city_rotation_index` UPDATE happens once after the loop in its own try/catch.
- Track `stopReason`:
  - `target_met` — `insertedSoFar >= scrapeTarget`
  - `city_cap` — `citiesAdvanced >= MAX_CITIES_PER_RUN` and target unmet
  - `rotation_exhausted` — `citiesAdvanced >= cityRotation.length` and target unmet
  - `no_scrape` — `scrapeTarget === 0` or actor/token missing
- After final distribution, `remainingCapacity = Σ capacity.values()` (capacity map is mutated by both distribute passes).
- Details payload:
  - `quotaMet = remainingCapacity === 0`
  - When `!quotaMet`: add `unfilled: remainingCapacity` and `warnings: string[]` composed from `stopReason` + counts:
    - city_cap: `"Quota short by N: scraped 8/8 cities (hit city cap), M new leads inserted. Raise MAX_CITIES_PER_RUN or add more cities."`
    - rotation_exhausted: `"Quota short by N: ran out of cities in rotation (K scraped), M inserted. Add more cities to the rotation."`
    - no_scrape: `"Quota short by N: scraper not configured (no actor or APIFY_TOKEN)."`
    - target_met (rare): `"Quota short by N: pool exhausted before all setters filled. Add more cities or lower a setter's quota."`
  - When `quotaMet`: set `quotaMet: true`, omit `warnings`.
- Existing `status` mapping (success/partial/failed/skipped) unchanged.

## 3. `src/lib/api/scraper.functions.ts`

`listScraperSetters` "day" range filters by `assigned_at >= startOfTodayET()` (count by `assigned_user_id`). Week/month/90d keep `created_at`. Import TZ helper from pipeline module.

## 4. `src/routes/app/_authenticated/admin/scraper.tsx`

Recent runs row: when `d.quotaMet === false`, render a small ⚠️ amber badge after the status pill with `title={(d.warnings as string[])?.[0] ?? "Quota not met"}`. Expanded `<pre>` already shows full details. No other UI changes.

## Files

- `supabase/migrations/<new>.sql`
- `src/lib/scraper-pipeline.server.ts`
- `src/lib/api/scraper.functions.ts`
- `src/routes/app/_authenticated/admin/scraper.tsx`
