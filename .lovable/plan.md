## Goal

Setter accounts get (1) call metrics pulled from Quo — dials today, connected calls + talk time, week and all-time totals — and (2) a Recording Hub where they can browse/play every recording from their Quo number, searchable by phone number or lead name.

## Verified current state

- `call_logs` already stores `openphone_call_id`, `direction`, `status`, `duration_sec`, `recording_url`, `transcript`, `summary`, `user_id`, `lead_id`, `pool_lead_id`.
- Ingestion today is the webhook `src/routes/api/public/hooks/openphone.ts` (attributes direct Quo calls to setters via `openphone_number_pool`, falling back to `profiles.openphone_number_e164`), plus an admin-only reconciliation fn `backfillOpenphoneArtifacts` in `src/lib/api/calls.functions.ts`.
- Setter dashboard (`getClientDashboard`) currently shows claimed leads / contacted / booked — no call data at all. Admin's `getClientDetail` is the only place counting dials.
- A code comment in the existing backfill notes Quo's `/v1/calls` list needs the external participant number, so a plain "list all calls for a number" pull may not be available. Step 1 below verifies this against the live API before the sync design is locked.

## Plan

### 1. Verify the Quo calls API (first step, before writing the sync)

Probe `GET /v1/calls` with `phoneNumberId` and a date window using `OPENPHONE_API_KEY`. If listing by number works, the sync is a straight per-number pull. If it truly requires `participants`, the sync instead reconciles per known external number (claimed pool leads + existing `call_logs` rows) and the webhook stays the primary source of new calls. Either way the app reads from `call_logs`, so nothing downstream changes.

### 2. Background sync route + cron

New `src/routes/api/public/hooks/sync-quo-calls.ts`:
- For every setter number (`openphone_number_pool` + `profiles.openphone_number_e164`), pull calls from the last ~3 days.
- Upsert `call_logs` on `openphone_call_id`: direction, status, from/to, `duration_sec`, `started_at`/`ended_at`, and attribute `user_id` from the number mapping. Adopt matching unlinked in-app dial rows instead of duplicating them.
- Fetch recording / transcript / summary for rows still missing them and patch.
- Scheduled with `pg_cron` + `pg_net` every 5 minutes (anon `apikey` header). Reuses the existing helper logic rather than duplicating parsers.

### 3. Setter-facing server functions (`src/lib/api/calls.functions.ts`)

- `getMyCallStats` — from `call_logs` for `auth.uid()` excluding `status = 'manual_outcome'`: dials today, connected today, talk-time today, plus week-to-date and all-time dials/connected/talk time. Day/week boundaries use the existing ET helpers.
- `listMyRecordings` — paginated (20/page), newest first, `search` matches phone number digits or lead name (joins `leads` and `b2b_lead_pool`), optional "has recording only" toggle.
- `syncMyCalls` — manual refresh button: runs the same sync limited to the caller's number, then returns fresh counts.

RLS on `call_logs` already scopes setters to their own rows; I'll confirm and only add a policy if a read path is missing.

### 4. Dashboard overhaul (`src/routes/app/_authenticated/dashboard.tsx`)

Add a "Calls (from Quo)" block above the existing lead cards:
- Today: Dials · Connected · Talk time
- This week and All time rows beneath
- "Last synced X min ago" + Refresh button wired to `syncMyCalls`
- Existing claimed/contacted/booked cards stay.

### 5. Recording Hub

New route `src/routes/app/_authenticated/b2b.recordings.tsx`:
- Search box (number or lead name), pagination, sort by newest / longest.
- Each row: lead name (or bare number when unmatched), number, date/time, duration, direction, inline `<audio>` player for `recording_url`, and expandable transcript + AI summary when present.
- Tapping the lead name links to that lead's detail when it's matched.
- Added to `app-sidebar.tsx` and `bottom-nav.tsx` for setters (bottom nav swaps in "Calls"; the sidebar keeps all items).

## Notes

- Recordings are Quo-hosted URLs; some expire — the player will show a graceful "recording unavailable" state rather than a broken control.
- Unmatched calls still appear (per your choice), labeled by number only.
