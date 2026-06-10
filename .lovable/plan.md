## Scraper pipeline: scrape only when the pool can't cover demand

Tighten the pipeline so the scraper does nothing on days the existing lead pool already covers everyone's quota, and surface those skipped days in the admin UI.

### Pipeline behavior (`src/lib/scraper-pipeline.server.ts`)

Reorder so distribution happens before any decision to scrape:

1. Recycle stale "No Answer" leads (unchanged).
2. Compute per-setter shortfall = `quota − current New count`.
3. **Distribute first**: pull unassigned New leads from the pool and assign them to setters with shortfall, in order. Update each setter's remaining shortfall as we go.
4. Recompute total remaining shortfall across all setters.
5. **If remaining shortfall is 0 → skip scraping.** Log a `scraper_runs` row with `status: "skipped"`, `phase: "skipped"`, `leads_added: 0`, and details `{ reason: "pool_covered_demand", distributed, perSetter }`. Do not advance the city rotation cursor. Return.
6. Otherwise, call Apify for the remaining shortfall, dedupe + insert, then run a second distribution pass for the freshly inserted leads. Advance the city rotation cursor only after a real Apify call (current behavior — confirmed: don't burn a city on skip days).
7. Log the run with the city used as today.

### Admin UI (`src/routes/_authenticated/admin/scraper.tsx`)

A "Recent runs" card already exists (shows last 20 with status + raw details JSON). Improvements:

- Bump the list from 20 → 50 entries (in `listScraperRuns`).
- Render each run as a compact row: timestamp, status badge (`success` / `partial` / `failed` / `skipped`), city used, leads fetched, leads inserted, leads distributed. Keep the raw JSON behind a collapsible "Details" toggle instead of always-on `<pre>`.
- Add a `skipped` badge variant (muted) so skip days are obvious at a glance.

### Out of scope

- Changing the daily cron schedule.
- Changing recycle logic, dedupe rules, or quota math.
- Per-setter run history.

### Technical notes

- `scraper_runs.status` is a free text column today (values used: `success`, `partial`, `failed`); adding `"skipped"` requires no migration.
- `scraper_runs.phase` is also free text; using `"skipped"` keeps it filterable.
- City rotation cursor advances only inside the existing `if (cityUsed && needFromScrape > 0)` block — already correct for the "don't burn the city" rule once we route skip days around the Apify call.
