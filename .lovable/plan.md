## Goal
Flip the daily flow so recycling/distribution runs first, and the scraper only runs if the pool can't satisfy demand.

## New daily flow (single 9:00 AM ET run)

**Phase 1 — Recycle + Distribute (runs first)**
1. Recycle: unassign any lead where `assigned_user_id IS NOT NULL`, `status='New'`, `retired=false`, `assigned_at < now() - 23h`. (Same logic as today.)
2. Count enabled setters → `needed = enabledSetters × 150`.
3. Count available pool leads (unassigned, `status='New'`, not retired, not DNC).
4. Distribute up to 150 oldest pool leads to each enabled setter (FIFO). Record `shortfall = needed - distributed`.

**Phase 2 — Scrape (only if shortfall > 0)**
1. If `shortfall <= 0`, skip scraping entirely — log a `scrape` run with `scraped=0, reason="pool sufficient"`.
2. Otherwise, `scrapeTarget = ceil(shortfall × 1.2)`. Rotate cities until target hit or city cap reached.
3. After scraping completes, run **Distribute again** to hand the new leads to setters who came up short in Phase 1 (still capped at 150/setter/day total).
4. Log to `scraper_runs` with `phase='scrape'`.

## Code changes

**`src/lib/scraper-pipeline.server.ts`**
- Keep `runDistributePhase()` but have it return `{ distributedPerSetter: Map<userId, count>, shortfallTotal, perSetterShortfall }`.
- Change `runScrapePhase()` to accept an explicit `targetCount` parameter instead of computing `enabledSetters × 150 × 1.2` itself. Default behavior stays the same when called manually.
- New orchestrator `runDailyCycle()`:
  1. `runDistributePhase()` → get shortfall.
  2. If shortfall > 0, `runScrapePhase({ targetCount: ceil(shortfall * 1.2) })`, then `runDistributePhase()` again to fill setters that were short.
  3. If shortfall === 0, log skip and return.
- Manual "Run now" button switches to `runDailyCycle()` so admins get the same flipped behavior end-to-end.

**Cron jobs (replace existing two-job setup)**
- Unschedule `daily-scraper-9am-et` and `daily-distribute-930am-et`.
- Schedule a single job at 13:00 and 14:00 UTC (DST cover) hitting one endpoint that runs `runDailyCycle()`.

**Routes**
- New: `src/routes/api/public/hooks/run-daily-cycle.ts` — calls `runDailyCycle()` with the same `skipIfRanToday` guard against the new `phase='daily'` log entry.
- Keep `run-scraper.ts` and `distribute-leads.ts` around for now (admin can still trigger them individually), or delete them — say the word.

**`scraper_runs` logging**
- Add new phase value `'daily'` for the orchestrator run summary (totals: recycled, distributed_phase1, scraped, distributed_phase2, final_shortfall).
- Phase 1 still logs `'distribute'`, phase 2 still logs `'scrape'` so existing history stays consistent.

**Scraper admin page copy update**
- "Daily cron at 9:00 AM ET recycles uncalled leads, distributes 150/setter from the pool, and only scrapes if the pool runs short (target = shortfall × 1.2)."

## What stays the same
- Hardcoded 150/setter/day, 23h recycle window, 9:00 AM ET timing, 20% buffer on scrapes.
- City rotation, Apify settings, field map, per-setter enable toggle, master enable toggle.
- "Add leads" manual button and lead-request notifier flow.

## What I will NOT touch
- Existing assigned leads — they stay until tomorrow's recycle picks up uncalled ones.
- `daily_lead_quota` column on `profiles` (still ignored).

## Open question
Should the scraper kick in if even **one** setter is short, or only when the total shortfall is above some threshold (e.g. >50 leads)? Default in this plan = any shortfall > 0 triggers a scrape.