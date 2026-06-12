## Changes

### 1. Outcome shown on admin calendar tiles
In `src/routes/_authenticated/calendar.tsx` `ApptList`, render a badge on each booking card based on `a.outcome`:
- `closed` → green "Closed · $X" using `deal_amount`
- `lost` → red "Lost"
- `no_show` → amber "No show"
- otherwise nothing extra

Also surface `outcome` and `deal_amount` in `listAllAppointments` / `listMyAppointments` if not already (they are — already selected via `*`).

### 2. Configurable booking duration
- DB migration: add `slot_minutes int not null default 30 check (slot_minutes in (15,30,45,60,90,120))` to a new singleton `booking_settings` table (admin RLS + grants), or simplest: reuse a single-row table. Plan: create `booking_settings (id int pk default 1, slot_minutes int default 30, updated_at)` with admin-only write, authenticated read.
- Server fns: `getBookingSettings`, `updateBookingSettings`.
- `getAvailableSlots` in `src/lib/api/cl.functions.ts`: replace hardcoded `30` increments with `slot_minutes`; also use `slot_minutes` when checking for clashes (currently exact `eq(scheduled_at)`) — switch to a range overlap check: any booking where `scheduled_at < newEnd AND scheduled_at + duration > newStart`. Easiest: still block exact-slot collisions plus query overlaps via `gte/lt` on `scheduled_at` within `[start - duration + 1, start + duration - 1]`.
- Zoom meeting `duration` field uses `slot_minutes`.
- `AvailabilityEditor`: add a duration `<Select>` at the top (15/30/45/60/90/120 min) wired to the settings mutation.

### 3. Re-enable Zoom meeting creation
In `createAppointment`, replace `meeting_url = null` with `await createZoomMeeting({ topic: data.name, start_time: data.scheduled_at })` for `type === "booking"`. Pass duration from settings.

### 4. No-show outcome
- Migration: alter `appointments_outcome_check` to allow `'no_show'`.
- `setAppointmentOutcome` zod union: add `{ outcome: 'no_show' }` branch (clears deal/commission/lost_reason like "lost" path but no reason).
- `AppointmentDetailDialog`: add a "No show" button next to Closed/Lost; display amber "No show" badge in summary view; calendar tile badge handled in #1.

### 5. Remove "Company" from invite setter dialog
- `src/routes/_authenticated/admin/clients.index.tsx`: drop Company input + `company` state, send `company_name: ""` (or omit).
- Optionally hide Company column from the table (keep for now since data may exist).

### 6. Remove "Leads" stat on setter detail page
- `src/routes/_authenticated/admin/clients.$userId.tsx`: remove the `StatCard label="Leads"` card.

### 7. Fix commission formatting on iPhone
- `src/routes/_authenticated/commissions.tsx`: replace the raw `<table>` with a responsive card list on mobile (stack date/amount/note vertically) and keep table at `sm:` and up. Or wrap table in `overflow-x-auto` and tighten paddings — preferred: switch to a div-based stacked list for `< sm` and table for `>= sm`.

### 8. Auto-email lead after booking
- Run `email_domain--check_email_domain_status`. If no domain → show email setup dialog and stop until user completes it.
- Run `setup_email_infra` + `scaffold_transactional_email` (idempotent).
- Add a template `src/lib/email-templates/booking-confirmation.tsx` with lead name, date/time (formatted), and Zoom join link. Register in `registry.ts`.
- In `createAppointment` handler, after insert for `type === "booking"`, fire a send to the lead's email via the internal send route (server-side fetch with service auth) using `idempotencyKey = booking-confirm-<appt.id>`. Skip if no email.

## Technical notes
- All migrations include GRANT statements per project rules.
- `slot_minutes` defaults to 30 so existing flows continue working.
- Zoom env vars (`ZOOM_*`) already configured.
- Outcome badge styling reuses existing `bg-success/15`, `bg-destructive/15`, `bg-warning/15` tokens.

## Confirm before I build
1. Booking duration choices: 15/30/45/60/90/120 min — OK?
2. The lead confirmation email should send only for `booking` type (not callbacks). OK?
3. Keep the existing "Company" column on the setters list (just remove from invite form), or remove the column too?
