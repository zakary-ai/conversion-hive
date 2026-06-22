# Daily Scraper Engine — Targeted Changes

Scope: `src/lib/scraper-pipeline.server.ts` (core logic) + one small migration to support `placeId` dedupe. UI, recycle setting, field map, and scrape toggles stay untouched.

## 1. Demand sizing (scale to enabled setters)

In `runScraperPipeline`, after loading enabled setters and computing each setter's "leads-today" count (leads assigned to them with `created_at` ≥ start of today ET — matching how the Setters table already shows "leads today"):

- `requiredToday = Σ max(0, setter.daily_lead_quota − setter.leads_today)`
- `availablePool = COUNT(leads WHERE status='New' AND retired=false AND do_not_contact=false AND assigned_user_id IS NULL)` (recycled No-Answer leads already become eligible because the existing recycle step flips them back to `New`, unassigned — keep that step as-is, run it first).
- `shortfall = max(0, requiredToday − availablePool)`
- `scrapeTarget = Math.ceil(shortfall * 1.2)`

If `scrapeTarget === 0`, skip Apify entirely, still run distribution, log status `skipped`.

## 2. Multi-city rotation in one run

Replace the current "pick one city, advance by one" block with a loop:

- Start at `city_rotation_index`, walk the rotation array with wrap-around.
- For each city: set `apifyInput.locationQuery = city`, call Apify with `maxItems` / `maxCrawledPlacesPerSearch` = `batch_size`, run the category filter + placeId dedupe + insert, and tally `newlyInserted`.
- After each city, advance the pointer (persist at the end of the run — single UPDATE to `city_rotation_index`).
- Stop when `newlyInserted ≥ scrapeTarget` OR 8 cities have been scraped in this run.
- Log every city attempted in `details.cities = [{city, fetched, inserted}, ...]`.

## 3. Category filter + placeId dedupe

Before insert, in addition to existing name/phone normalization:

- Read `categoryName` from the raw row (independent of field_map, which targets `company`). Keep only rows where `/kitchen\s+(remodel|renovat)/i` matches.
- Read `placeId` from the raw row. Drop rows without one. Dedupe within the batch by placeId AND against DB by placeId (new `place_id` column, unique index).
- Phone/email dedupe stays as a secondary guard.
- Update default `apify_input.searchStringsArray` (and any other search-term key currently used) so a fresh install seeds `"kitchen remodeler"` instead of `"Kitchen Remodel"`. Existing rows in `scraper_settings` are not overwritten — admins can edit through the existing UI.

Migration (separate, runs first):

```sql
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS place_id text;
CREATE UNIQUE INDEX IF NOT EXISTS leads_place_id_key ON public.leads (place_id) WHERE place_id IS NOT NULL;
```

No GRANT / RLS changes needed (column on existing table).

## 4. Round-robin distribution to every enabled setter

Replace the current sequential `distributePool` (which drains the pool for setter A before touching B) with a round-robin pass:

- Build `capacity[setter] = max(0, daily_quota − leads_today)` for every enabled setter.
- Pull oldest-first eligible pool leads in one query.
- Walk the pool, assigning leads in a rotating order across setters until either the pool is exhausted or every setter's capacity reaches 0. Only set `assigned_user_id` — do NOT introduce a new `'assigned'` status (the existing setter UI treats `status='New'` + `assigned_user_id=me` as the active queue; changing status would break it). `assigned_at` is implicit via `last_status_change_at` only triggering on status change, so we'll skip a dedicated timestamp.
- Run distribution twice: once before scraping (drain existing pool) and once after (place freshly inserted leads). The capacity map is decremented in place so reruns the same day can never exceed quota.

## 5. Run log

`scraper_runs.details` payload becomes:

```json
{
  "requiredToday": 225,
  "availablePool": 40,
  "shortfall": 185,
  "scrapeTarget": 222,
  "cities": [{"city": "...", "fetched": 200, "inserted": 47}, ...],
  "fetched": 800,
  "inserted": 188,
  "distributed": 225,
  "perSetter": [{"user_id": "...", "name": "...", "needed": 75, "assigned": 75}, ...]
}
```

`status` = `skipped` when `scrapeTarget === 0`, `success` when no errors, `partial` if some city errored but leads were distributed, `failed` otherwise.

## Files touched

- `supabase/migrations/<new>.sql` — add `place_id` column + unique partial index.
- `src/lib/scraper-pipeline.server.ts` — rewrite demand sizing, city loop, category filter, placeId dedupe, round-robin distribute, richer run log.
- `src/lib/api/scraper.functions.ts` — no signature changes; `listScraperSetters` already returns `current_new` for the day so the UI keeps working.

## Out of scope (explicitly unchanged)

UI layout, recycle_days setting, scrape-option toggles, field_map shape, 8 AM EST cron, manual "Run now" / "Add leads" buttons, Recent-runs table columns.
