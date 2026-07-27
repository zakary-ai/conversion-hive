# Google Calendar-aware B2B Booking

## Goal
When a setter books a B2B appointment, the time picker only shows slots where at least one active B2B closer is free on their connected Google Calendar. Any busy event on their primary calendar blocks that time. Closers connect their own Google account via the App User Connector.

## 1. Google Calendar App User Connector
- Use the existing `google_calendar` App User Connector (per-user OAuth) via `connector_app_user--connect_client` — user completes the client setup form once at the workspace level (client + redirect URI `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`, offline access enabled).
- Scopes requested at consent:
  - `openid`, `userinfo.email`, `userinfo.profile`
  - `https://www.googleapis.com/auth/calendar.freebusy` (read-only free/busy is all we need)

## 2. Storage for per-closer connection keys
Migration adds:
```
app_user_connections(user_id, connector_id, connection_key_ciphertext, ...)
```
- Encrypted at rest with `APP_USER_CONNECTION_KEY_SECRET` (auto-provisioned).
- `service_role` only; RLS on. Follows the standard app-user connection storage pattern.

## 3. Server code
New files (all `.functions.ts` / `.server.ts` under `src/lib/`):
- `googleCalendar.server.ts` — `encrypt/decrypt`, `saveConnectionKeyForUser`, `getConnectionKeyForUser`, `deleteConnectionKeyForUser`, and `getFreeBusy(userId, timeMin, timeMax)` calling `POST /calendar/v3/freeBusy` via `callAsAppUser`.
- `googleCalendar.functions.ts`:
  - `startGoogleCalendarConnect` (auth'd): calls `connectAppUser` with scopes; returns auth URL for the popup.
  - `completeGoogleCalendarConnect` (auth'd): exchanges one-time `code` with `exchangeAppUserOAuthCode` and saves the encrypted key for `context.userId`.
  - `disconnectGoogleCalendar` (auth'd): `disconnectAppUser` + delete row.
  - `getMyGoogleCalendarStatus` (auth'd): boolean connected.
  - `getB2bAvailableCloserIdsForSlot({ startISO, endISO })` (auth'd): returns closer user_ids that are free (and, later, can be used by auto-assign).
- New public route `src/routes/oauth/google-calendar/return.tsx` — popup landing page: parses `code`, calls `completeGoogleCalendarConnect`, `postMessage`s parent, closes.

## 4. Slot filtering for B2B bookings
The B2B booking UI (`src/components/lead-booking-dialog.tsx` → `SlotPicker`) currently accepts any time. Add a new server fn:
- `listB2bAvailableSlots({ tz, fromISO, toISO })`:
  1. Load active `b2b_closers` with `user_id` set.
  2. For each, look up their stored Google Calendar key. Closers without a connected calendar are treated as always-free (so booking still works during rollout) — behavior configurable via a single constant `REQUIRE_GCAL_FOR_B2B_CLOSERS` (default `false`).
  3. Batch `freeBusy` query for the window across connected closers (Google supports up to 50 calendars per call).
  4. Also subtract existing `appointments` rows for those closers (Google won't know about internal-only bookings until they're pushed there).
  5. Generate 15-min candidate slots inside working hours (reuse closer declared weekly availability if present via `closer_availability_declarations` for `line = 'b2b'`; else default 9–5 in the chosen tz).
  6. Return slots where ≥1 closer is free plus which closer_ids are free (used later by auto-assign).

Update `SlotPicker` to accept an optional `availableSlots: Date[]` prop; when passed, it displays only those and disables custom entry. `lead-booking-dialog.tsx` fetches from `listB2bAvailableSlots` on mount / tz change and passes the result. Non-B2B paths stay unchanged.

## 5. UI to connect Google Calendar
On the closer profile page (`src/routes/app/_authenticated/profile.tsx`) plus the closer home (`src/routes/app/_authenticated/closer/index.tsx`), add a card:
- If not connected: "Connect Google Calendar" button → opens popup with the auth URL, listens for the `postMessage` from the return route, refreshes status.
- If connected: shows "Connected" + Disconnect button.

## 6. Setup steps required of you
- Approve the `connector_app_user--connect_client` prompt for `google_calendar` (one-time, workspace-level).
- Add the OAuth redirect `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback` in your Google Cloud OAuth client and enable the Calendar API + `calendar.freebusy` scope on the consent screen.

## Out of scope (for a follow-up if you want it)
- Writing the booked appointment back to the assigned closer's Google Calendar as a real event.
- Auto-assigning the specific closer at booking time (right now we still keep current assignment logic; free/busy just gates slot visibility).

## Technical notes
- Free/busy calls happen only server-side via `callAsAppUser` with each closer's stored `lovack_*` key — never in the browser.
- Slot enumeration is capped (e.g. next 14 days, 15-min granularity) to keep the Google API call small and fast.
- Cache free/busy results per closer for ~60s in memory of the server fn call to avoid duplicate requests within one page render.
