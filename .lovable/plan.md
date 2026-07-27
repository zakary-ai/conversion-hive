## Goal

On setter accounts, when a call is logged as "Book," swap the embedded GoHighLevel iframe for the same native date/time picker used elsewhere in the app. Picking a slot auto-assigns whichever B2B closer is free on their Google Calendar at that time (works for 1 closer today, scales to many).

## What already exists (verified)

- `listAvailableSlots` (`src/lib/api/cl.functions.ts`) already returns slots where at least one active `b2b_closers` row is free — checks existing appointments AND that closer's Google Calendar freeBusy. Multi-closer safe.
- `SlotPicker` component uses that endpoint with a calendar + timezone selector.
- `b2b_lead_pool` rows have first/last name, email, phone. `appointments` table supports `b2b_closer_id`, `status`, `meeting_url`.
- Admin's `assignB2bCloser` flow already creates a Zoom meeting on the closer's credentials and emails the lead. Reusable.

## Changes

### 1. New server fn `bookB2bSlotForLead` in `src/lib/api/b2b-pool.functions.ts`

Input: `{ pool_lead_id, scheduled_at (ISO), timezone }`.

Handler (all under service role for the assignment race):
1. Load the pool lead — require it belongs to the calling setter (claimed_by = userId) and has an email. Error clearly if email is missing.
2. Recompute availability at that exact `scheduled_at` using the same rules as `listAvailableSlots` (global B2B window + closer conflict + gcal freeBusy + pending_assignment reservation). If slot no longer valid → throw "That time was just taken."
3. Pick the first `b2b_closers` row (active) with no appointment conflict and no gcal conflict at that slot. Deterministic order by `id` so parallel setters don't collide on the same closer (rely on the collision check in step 4 to catch races).
4. Insert into `appointments`: `type=booking`, `status=assigned`, `b2b_closer_id=<picked>`, `user_id=<setter>`, `lead_id=<pool_lead_id>`, `name`, `email`, `phone`, `scheduled_at`, `timezone`. Re-check no other assigned appointment exists for that closer at that scheduled_at; on unique conflict, retry with the next available closer up to N times, else throw.
5. Create Zoom meeting on that closer's `b2b_closer_zoom_credentials` (reuse existing `createZoomMeetingOnCloserAccount` helper). Update `meeting_url`. If Zoom creds missing, leave `meeting_url` null and continue (matches admin flow behavior).
6. Send booking confirmation email via existing `sendBookingConfirmationEmail`.
7. Call the existing `logCallOutcome` logic inline (or duplicate the write): insert `b2b_call_attempts` row with `outcome=booked`, mark `b2b_lead_pool.status='booked'`, and set `pool_lead_id` on the corresponding `call_logs` row when present.

Returns `{ appointment_id, closer_name, meeting_url }`.

### 2. New `BookingSlotDialog` component `src/components/b2b-booking-slot-dialog.tsx`

- Uses `<SlotPicker>` + a Confirm button.
- Shows the lead name in the title and confirms the picked local time.
- On confirm → calls `bookB2bSlotForLead`, toasts success with assigned closer + Zoom link status, closes.

### 3. Wire it into `LogCallOutcomeDialog`

`src/components/log-call-outcome-dialog.tsx`:
- Replace `BookingIframeDialog` import + JSX with `BookingSlotDialog`.
- Pass `lead` (with email) — update the `Lead` type to include email so the parent dialogs pass it down. Both callers (`LeadPreviewDialog`, My Leads list) already load email; just plumb it through.
- Remove the "Did the booking go through?" `window.confirm` — booking success is deterministic now. On success, `onClose` and invalidate the same query keys as today.

### 4. Cleanup

- `src/components/booking-iframe-dialog.tsx` stays for now (unused after this change, no other callers per grep). Leave file or delete — will delete since nothing else imports it.

## Multi-closer notes

Everything above already iterates over all `b2b_closers` where `active=true`. Adding a second closer = create their `b2b_closers` row + connect their Google Calendar from Profile + fill in `b2b_closer_zoom_credentials`. No further code changes.

## Out of scope

- Changing admin B2B calendar / reschedule flows.
- Changing B2C booking flow.
- Any UI on the closer side beyond what's already wired.
