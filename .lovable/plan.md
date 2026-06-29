## Goal

Make B2B bookings work like B2C: a setter books a lead into a B2B closer slot; the booking sits as "pending assignment" with no Zoom and no lead email; an admin (or setter, if you prefer same as B2C) assigns a B2B closer, which then creates the Zoom meeting on that closer's account and emails the Zoom link to the lead. The Calendar > Availability tab is replaced with a B2C-style panel, and the existing Closers admin gets a "B2B closer" toggle plus a second availability editor for B2B hours.

## Database changes

New/changed columns on existing tables:

- `closers.b2b_active boolean not null default false` — marks a closer as eligible for B2B routing.
- `closer_availability_rules.track text not null default 'b2c'` (allowed values `'b2c' | 'b2b'`) — lets each closer have separate B2C and B2B weekly hours.
- `appointments` gets the B2C-style routing fields:
  - `assigned_closer_id uuid references public.closers(id)` (nullable)
  - `zoom_join_url text` (alias surface for `meeting_url`; we'll just keep using `meeting_url`)
  - extend `status` text usage to include `pending_assignment | assigned | completed | cancelled` for `type = 'booking'`. Existing rows keep their current status.

New table: `b2b_settings` mirroring `b2c_settings`:

```text
id int pk default 1
slot_minutes int not null default 30
days_out int not null default 14
updated_at timestamptz
```

`availability_rules` (the current global B2B weekly window) is kept and repurposed as the B2B global window (same role as `b2c_availability_rules`).

All new columns/tables get GRANTs + RLS policies in the same migration (read for `authenticated`, write gated to admins via `has_role`).

## Closers admin page (`/app/admin/closers`)

Per closer row:

- Existing "Active" switch stays (B2C eligibility).
- New "B2B closer" switch bound to `b2b_active`.
- "Availability" dialog gets two tabs: **B2C hours** and **B2B hours**. Each tab is the existing weekly editor but reads/writes `closer_availability_rules` filtered by `track`.
- Zoom credentials block is unchanged — the same per-closer Zoom account is reused for both tracks.

## Calendar tab overhaul (`/app/calendar`, Availability sub-tab for admins)

Replace the current single global editor with a panel modeled on `b2c-calendar-panel.tsx`:

1. **Booking settings** card — call length (`slot_minutes`) and `days_out`, persisted to `b2b_settings`.
2. **Weekly availability** card — global B2B window, persisted to `availability_rules` (same shape as today, just relabeled as the global window).
3. **Pick a date** card — calendar + day view of B2B bookings with assignment / reassignment controls (same UI as `DayBookingList` in the B2C panel, but reading B2B appointments).

The setters' calendar views (My calendar / All setters / History) stay unchanged in layout. Bookings show their assignment state (Pending assignment / Assigned to <closer> / Cancelled) and the "Join meeting" link only appears once a Zoom URL exists.

## Setter booking flow

In the setter slot picker (`SlotPicker` + `createAppointment`):

- `listAvailableSlots` becomes B2B-aware: a slot is offered only when it falls inside the global B2B window AND at least one `b2b_active` closer with B2C/B2B track = `b2b` is free at that time (no conflicting `appointments` row for that closer's `assigned_closer_id`, accounting for `slot_minutes`).
- `createAppointment` for `type = 'booking'`:
  - Re-validates the slot against B2B availability + collisions.
  - Inserts `appointments` row with `status = 'pending_assignment'`, `assigned_closer_id = null`, `meeting_url = null`.
  - Does NOT create a Zoom meeting and does NOT call `sendBookingConfirmationEmail`.
- Setter sees a toast like "Booking saved — waiting on closer assignment".

## Assignment flow (admin)

New server fns mirroring B2C:

- `listB2bBookings` (admin) — pending and assigned B2B appointments.
- `assignB2bCloser({ appointment_id, closer_id })`:
  - Verifies closer is `b2b_active`, has Zoom creds, and is free at that slot.
  - Loads the closer's Zoom creds (existing `closer_zoom_credentials`) and creates the Zoom meeting on that closer's account (reuse the helper used by B2C for `createCloserBookingZoom`).
  - Updates the appointment: `assigned_closer_id`, `meeting_url`, `status = 'assigned'`.
  - Fires `sendBookingConfirmationEmail` to the lead with the Zoom link (existing template).
- `unassignB2bCloser` / `cancelB2bBooking` for admin reassignment + cancellation, same pattern as the B2C versions; cancellation revokes the Zoom meeting where possible and emails are not re-sent on re-assignment unless the time changes (use existing reschedule path for that).

The Calendar > Availability "Pick a date" day list uses these fns and shows the same controls as B2C (Assign / Reassign / Reschedule / Cancel / Delete).

## Email + Zoom

- The existing `booking-confirmation` template is reused. It is now only sent from the assignment server fn, never from `createAppointment`.
- Reschedules of an already-assigned B2B booking re-send the confirmation with the new time and (if re-Zoomed) the new join URL.
- Cancellation does not email the lead automatically (matches B2C).

## File-level changes

- `supabase migration` — new columns, `b2b_settings`, GRANTs, RLS, backfill (`closer_availability_rules.track = 'b2c'`, existing booking rows get `status = 'assigned'` when they have a `meeting_url`, otherwise left alone).
- `src/lib/api/cl.functions.ts` — split out: `listAvailableSlots`, `createAppointment` updated for B2B routing; new `listB2bBookings`, `assignB2bCloser`, `unassignB2bCloser`, `cancelB2bBooking`, `getB2bSettings`, `updateB2bSettings`, `listB2bAvailability`, `replaceB2bAvailability`, `listB2bCloserAvailability`, `replaceB2bCloserAvailability`.
- `src/lib/api/b2c.functions.ts` — extend `updateCloser` input + `listClosers` projection to include `b2b_active`.
- `src/components/availability-editor.tsx` — replaced/extended into a B2C-style panel (Booking settings + Weekly availability + Pick-a-date day view).
- `src/routes/app/_authenticated/admin/closers.tsx` — add `b2b_active` switch and a tabbed availability dialog (B2C / B2B).
- `src/routes/app/_authenticated/calendar.tsx` — Availability tab now renders the new panel; ApptList shows assignment state.
- `src/components/slot-picker.tsx` — no UI change, but the query key now reflects the new B2B-aware slot fn.

## Out of scope for this change

- Multi-closer round-robin auto-assignment. Admin assigns manually (you can ask for auto-assign later).
- Changing the existing B2C flow.
- Touching the public `/apply` booking flow.

## Open follow-ups I'll handle during build

- Backfill rule for any existing booking-type appointments without `meeting_url` (default to `pending_assignment` so they surface in the new admin queue).
- A small migration verifying that existing global `availability_rules` rows still represent the desired B2B window — they're left in place, just renamed in the UI.
