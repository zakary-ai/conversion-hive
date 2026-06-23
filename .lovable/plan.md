## Goal
Replace the complicated quota/distribution logic with a simple, predictable daily flow:

1. **9:00 AM ET** — scraper runs. It targets **120% of the total leads needed** for all enabled setters (e.g. 5 enabled setters × 150 = 750 needed → scrape ~900).
2. **9:30 AM ET** — recycle + distribute:
   - Any leads that were assigned in yesterday's 9:30 AM run and never called (status still "New", no `last_status_change_at` after assignment) get **unassigned back into the pool**.
   - Every enabled setter gets **exactly 150 fresh leads** from the pool (oldest first).
3. A single **enable toggle** on the scraper page controls whether the whole thing runs.

Starts tomorrow morning.

## Scraper page changes (`src/routes/app/_authenticated/admin/scraper.tsx`)
Strip the page down per the request — the master toggle is the only control for the new flow.

- Keep: master enable toggle, Apify actor ID, search terms, location/city rotation, language, max results, scrape options, field mapping, "Run now" button, setters table (read-only stats + per-setter enable toggle).
- Remove: per-setter "Daily quota" input (hard-coded to 150), "Add leads" manual assign column, recycle-days input (recycling is now the 24-hour cycle), batch-size input (derived from setter count).
- Update copy: "Daily cron at 9:00 AM ET scrapes 120% of demand. 9:30 AM ET recycles uncalled leads and gives each enabled setter 150 fresh leads."

## Pipeline rewrite (`src/lib/scraper-pipeline.server.ts`)
Two distinct operations instead of one mixed pipeline:

**`runScraperOnly()`** — called at 9:00 AM:
- Count enabled setters (`role=client` + `scraper_enabled=true`).
- `scrapeTarget = ceil(enabledSetters × 150 × 1.2)`.
- Rotate through cities until that many new leads are inserted (or city cap is hit).
- Inserts go into the pool (`assigned_user_id = null`). No distribution.
- Logs to `scraper_runs` with phase `"scrape"`.

**`recycleAndDistribute()`** — called at 9:30 AM:
- **Recycle:** find all leads where `assigned_user_id IS NOT NULL`, `status='New'`, `retired=false`, and `assigned_at < now() - 23 hours` (covers the 9:30→9:30 window). Set `assigned_user_id=null`, `assigned_at=null`. These were assigned yesterday and never touched (any call/status change would have moved status off "New").
- **Distribute:** for each enabled setter, assign exactly 150 oldest pool leads. If the pool runs dry, that setter just gets fewer — log it.
- Logs to `scraper_runs` with phase `"distribute"`.

The existing `runScraperPipeline` (manual "Run now" button) becomes `runScraperOnly()` + immediate `recycleAndDistribute()` back-to-back so the button still does the full end-to-end thing for admins.

## Cron jobs (replace existing `daily-lead-scraper`)
```sql
SELECT cron.unschedule('daily-lead-scraper');

-- 9:00 AM ET = 13:00 UTC (winter) / 14:00 UTC (summer).
-- Run at both 13:00 and 14:00 and let the handler no-op if it already ran today in ET.
SELECT cron.schedule('daily-scraper-9am-et', '0 13,14 * * *', $$ ... POST /api/public/hooks/run-scraper ... $$);
SELECT cron.schedule('daily-distribute-930am-et', '30 13,14 * * *', $$ ... POST /api/public/hooks/distribute-leads ... $$);
```
The handlers check "did this phase already run today in ET" via `scraper_runs` and skip if yes — that handles DST cleanly without hard-coding offsets.

## New route
`src/routes/api/public/hooks/distribute-leads.ts` — mirrors `run-scraper.ts`, calls `recycleAndDistribute()`.

## Schema
No table changes needed. `daily_lead_quota` column stays in `profiles` but is no longer read (hard-coded 150 in code). I'll leave it alone rather than drop it, in case you want quotas back later.

## What stays the same
- Apify settings, city rotation, field map, "Run now" button.
- Per-setter `scraper_enabled` toggle (controls who's in the rotation).
- `scraper_runs` log table.

## What I will NOT touch unless you say so
- The 358 leads currently assigned to Will / Lynn — they stay assigned until tomorrow's 9:30 AM recycle picks up any uncalled ones. If you'd rather wipe the slate clean tonight so tomorrow is a fresh start, say the word.
