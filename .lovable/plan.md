# Lead Scraper & Auto-Distribution

## Goal
Every day at 8am EST, run one Apify scrape, then distribute fresh leads to each enabled setter so they each have their daily quota (default 75) of `New` leads. Leads marked `Booked` or `Not Interested` are permanently retired. Leads marked `No Answer` come back into the pool after 3 days.

## Admin UI (under Leads → new "Scraper" tab)
- **Master toggle**: scraper on/off (kill switch).
- **Apify config**: actor ID + JSON input template (editable), batch size (default 200).
- **Per-setter table**: name, enabled toggle, daily quota (default 75), current `New` count, last topped-up at.
- **Run now** button (manual trigger, same logic as cron).
- **Run history**: last N scraper_runs with leads fetched / distributed / per-setter breakdown / errors.

## Setter status changes (existing leads page)
- `Booked`, `Not Interested` → lead is retired (never recycled).
- `No Answer` → lead becomes eligible to recycle 3 days after the status was set.
- All other statuses (`Contacted`, `Interested`, `Follow Up`, `Call Back`) → lead stays with that setter, not recycled.

## Daily run logic (8am EST)
1. If master toggle off → exit.
2. Compute total demand = sum over enabled setters of `max(0, daily_quota − current New count)`.
3. **Recycle pass**: unassign + reset to `New` any lead currently `No Answer` whose `contacted_at` is >3 days old AND not `do_not_contact` AND assigned setter isn't the only enabled one (round-robin to a different setter where possible).
4. **Scrape pass**: call Apify with batch size 200 (configurable). Dedupe against existing leads by phone+email. Insert new leads as unassigned, `status='New'`.
5. **Distribute pass**: for each enabled setter, assign leads (recycled first, then freshly scraped) until they hit their quota. If pool runs dry, log shortfall in `scraper_runs` and stop.
6. Log one `scraper_runs` row per setter with leads_added + status (success/partial/failed).

## Technical details

### Schema changes
- `profiles`: add `scraper_enabled boolean default true`, `daily_lead_quota int default 75`.
- `leads`: add `last_status_change_at timestamptz` (auto-updated by trigger when status changes), `retired boolean default false` (true for Booked / Not Interested so we never reassign).
- New table `scraper_settings` (single-row config): `enabled bool`, `apify_actor_id text`, `apify_input jsonb`, `batch_size int default 200`, `updated_at`.
- Reuse `scraper_runs`, but add: `phase text` (`scrape` | `distribute` | `recycle`), `details jsonb` for per-setter breakdown.
- Trigger: bump `last_status_change_at` on `leads.status` UPDATE; auto-set `retired=true` when status becomes `Booked` or `Not Interested`.

### Secrets
- Need `APIFY_TOKEN` (request via add_secret).
- Apify actor ID is stored in `scraper_settings`, not a secret (admin-editable).

### Server functions (`src/lib/api/scraper.functions.ts`, all `requireSupabaseAuth` + admin check)
- `getScraperSettings`, `updateScraperSettings`
- `listScraperSetters` (profiles + enabled/quota + current new count)
- `updateSetterScraperConfig({ user_id, enabled?, daily_lead_quota? })`
- `runScraperNow()` → invokes the same handler the cron calls
- `listScraperRuns({ limit })`

### Cron endpoint
- `src/routes/api/public/hooks/run-scraper.ts` (POST). Verifies `apikey` header = anon key. Calls shared `runScraperPipeline()` helper which uses `supabaseAdmin` to bypass RLS for the distribution writes.
- pg_cron job at `0 13 * * *` UTC (= 8am EST during standard time; document DST caveat — switch to `0 12 * * *` during EDT or accept the 1-hour shift).
- Apify call: `POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items?token=$APIFY_TOKEN` with the saved input JSON; map result fields (configurable mapping in `scraper_settings.field_map`) → `{name, phone, email, company, source}`.

### Recycle eligibility query
```
status='No Answer' AND last_status_change_at < now() - interval '3 days' AND retired=false AND do_not_contact=false
```

### Dedupe
On insert, skip rows where `(phone is not null AND phone exists)` or `(email is not null AND email exists)` across the whole `leads` table.

## Out of scope (ask separately)
- Multi-source scraping (only one Apify actor configured at a time).
- Lead quality scoring / prioritization beyond round-robin recycle.
- Notifying setters when new leads arrive.

## Files touched
- Migration: schema changes + trigger above.
- New: `src/lib/api/scraper.functions.ts`, `src/lib/scraper-pipeline.server.ts`, `src/routes/api/public/hooks/run-scraper.ts`, `src/routes/_authenticated/admin/leads.tsx` (add Scraper tab) or new `admin/scraper.tsx` route.
- Edited: `src/lib/api/cl.functions.ts` (status update → set `retired` and `last_status_change_at` via trigger automatically; no code change needed if trigger handles it).
- pg_cron insert via supabase insert tool after deploy.

Confirm and I'll need you to provide the Apify API token + actor ID when we get to wiring.
