# B2C Booking Improvements

## 1. Timezone picker on the apply page

In `src/routes/apply.tsx` `BookingStep`:
- Convert `tz` from a memo to state; default to `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Add a `<Select>` above the calendar: "Detected", then ET/CT/MT/PT/AKT/HT plus a small international group (London, Berlin, Dubai, Singapore, Sydney).
- Slot query already keys on `tz` — the change flows through automatically.

## 2. "Thanks for applying" email on booking

In `createCloserBooking` (`src/lib/api/b2c.functions.ts`), after successful insert, fire the existing `booking-received` template via `sendTransactional` inside try/catch. Idempotency key: `booking-received-<booking_id>`. Copy: "Thanks for applying — you'll receive a follow-up email once an interviewer is assigned."

## 3. Reschedule: status, audit fields, email, manual admin action

Migration adds to `closer_bookings`:
- `previous_slot_start timestamptz`
- `rescheduled_at timestamptz`
- `unbooked_at timestamptz`

`rescheduleCloserBooking`:
- Capture previous slot, set `status = 'rescheduled'`, `rescheduled_at = now()`, `previous_slot_start = old`.
- Always send the new `booking-rescheduled` email to the applicant (old + new time), independent of closer assignment.

New template `booking-rescheduled.tsx` registered in `registry.ts`.

New admin server fn `markBookingRescheduled` (admin-only) — flips status to `rescheduled` and sends the same email without changing time. Surfaced as a menu item in `BookingCard` in `admin/bookings.tsx`.

## 4. Auto "unbooked" sweep at 5 minutes

New route `src/routes/api/public/hooks/mark-unbooked.ts` — scans `closer_bookings` where `status = 'pending_assignment'` AND `slot_start < now()`, sets `status = 'unbooked'`, `unbooked_at = now()`. Every 5 minutes is safe: worst-case a booking sits 5 minutes past its slot time before flipping, which is fine, and the sweep is a cheap indexed query. Booking-slot-timed cron would require per-row scheduling and is not worth the complexity.

For each newly-unbooked booking, look up the linked application's `credit_score_range` and send one of two templates:
- Credit `"600-650"` (unqualified filter) → `booking-declined.tsx`: "Thank you for applying, but we've decided to move in another direction." No reapply link.
- All other credit ranges → `booking-unbooked.tsx`: "Sorry, all our interviewers are booked at the moment. We invite you to reapply." Contains reapply link `https://.../apply?reapply=<booking_token>`.

pg_cron scheduled via `supabase--insert` calling `https://project--77a6d453-2ccb-4bdc-b7a5-7900dd491db2.lovable.app/api/public/hooks/mark-unbooked` every 5 minutes with `apikey` header.

UI surfacing:
- Admin bookings page: `unbooked` status included in History section with a red badge.
- DM setter calendar (`dm-setter/calendar.tsx`) + DM setter lead lists: red "Unbooked" outcome badge alongside existing outcome badges.

## 5. Reapply flow with 5-day expiry

`applications` table — add:
- `status text` (values used: `submitted` default, `reapplied`)
- No token field needed; the existing `booking_token` from `applications` is reused as the reapply key.

`booking-unbooked` email builds link `?reapply=<application.booking_token>`.

New server fn `resolveReapplyToken` (public):
- Looks up application by `booking_token`.
- Finds the most recent `unbooked` booking for that application.
- Rejects if `unbooked_at` is older than 5 days.
- Returns application row + a fresh short-lived nonce for the follow-up call.

`apply.tsx`:
- Recognize `?reapply=<token>`; when present, skip the form step, prefill from returned application data, jump to `BookingStep`.
- Show a small banner: "Welcome back — pick a new time."
- If token invalid/expired, show a friendly "This link has expired — please apply again" and offer a link to `/apply`.

New server fn `createReapplyBooking`:
- Validates token + 5-day window again server-side.
- Updates `applications.status = 'reapplied'` (keeps every other field intact).
- Inserts a new `closer_bookings` row (fresh `pending_assignment`) — the prior `unbooked` row stays for history.
- Sends the standard `booking-received` email.

Admin visibility:
- Applications list badge for `reapplied` status.

## Technical details

- One migration: three new columns on `closer_bookings`, one new column on `applications`, no enum changes (status values remain free-text as they are today). No new tables.
- Three new email templates registered in `registry.ts`: `booking-rescheduled`, `booking-unbooked`, `booking-declined`.
- One new public hook route + pg_cron entry (5-minute cadence).
- Two new server fns: `markBookingRescheduled`, `resolveReapplyToken`, `createReapplyBooking`. All existing auth/RLS unchanged.
- Reapply expiry enforced server-side (5 days from `unbooked_at`); the client just renders the expired-state message.
