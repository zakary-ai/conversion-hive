## B2C Pipeline — Plan

### 1. Admin B2B/B2C toggle
- Add a `channel` segmented control to the admin shell (persisted to `localStorage`).
- When `B2C` is active, the admin sidebar swaps the "Leads" / "Scraper" / "Clients" items for new B2C pages: **Applications**, **Bookings**, **Closers**.
- B2B pages and tables are untouched.

### 2. New database tables (B2C-only, separate from B2B)
- `closers` — admin-managed roster: `user_id` (FK auth.users, nullable until invite accepted), `full_name`, `email`, `zoom_user_email`, `active`.
- `closer_availability_rules` — per-closer weekly rules (same shape as setter `availability_rules`).
- `closer_bookings` — booking slot: `application_id`, `slot_start`, `slot_end`, `assigned_closer_id` (nullable), `status` (`pending_assignment` | `assigned` | `completed` | `cancelled` | `no_show`), `zoom_join_url`, `zoom_meeting_id`, `applicant_email`, `applicant_name`, `applicant_phone`.
- New role `closer` added to `app_role` enum.
- RLS: closers can read their own bookings + availability; admins manage all; applicants insert bookings via a public server fn keyed by application token.

### 3. Apply flow change
- After successful submit on `/apply`, redirect to `/apply/book?application=<id>&token=<one-time-token>` (token stored on the `applications` row).
- New page renders a slot picker that calls `listCloserSlots(weekStart)` — server fn that unions all active closers' availability, subtracts existing `closer_bookings` per slot, and returns slots with `capacity = number_of_free_closers` (cap shown as 3 today since 3 closers).
- Submit creates a `closer_bookings` row with `status='pending_assignment'`, no closer assigned yet. Confirmation page shown.

### 4. Admin: Bookings page
- Lists `closer_bookings` grouped by status. Each pending row shows applicant + slot + a "Assign closer" dropdown (only closers free at that slot).
- Assigning a closer:
  1. Updates `assigned_closer_id`, status → `assigned`.
  2. Calls existing Zoom helper to create a meeting under that closer's `zoom_user_email` (Server-to-Server OAuth already wired via `ZOOM_*` secrets).
  3. Stores `zoom_join_url` + `zoom_meeting_id` on the booking.
  4. Sends app email `closer-booking-confirmation` to applicant with date/time + Zoom link.
- Admin can also reassign (revokes old Zoom meeting, creates new one).

### 5. Admin: Closers page
- Table of closers with name/email/zoom email/active toggle.
- "Invite closer" button: admin enters name + login email + zoom email → inserts `closers` row and sends Supabase auth invite (magic link). On first sign-in, `handle_new_user` links `auth.users.id` back to the `closers` row by email and grants the `closer` role.
- Per-closer "Edit availability" opens the existing availability editor scoped to that closer.

### 6. Closer portal (new `_closer` layout)
- `_authenticated/closer/` subtree gated by `has_role(uid,'closer')`.
- **Home** (`/closer`): today's calls + upcoming this week, quick stats.
- **Calendar** (`/closer/calendar`): month/week view of assigned bookings, each card showing applicant, Zoom link, contact info.
- Closer-facing bottom nav (mobile) matches setter nav style.

### 7. Email template
- New app email `closer-booking-confirmation` (date/time, closer name, Zoom join link, reschedule contact). Reuses existing email infra.

### 8. Out of scope (per your note)
- Zoom account creation/onboarding for closers — assume `zoom_user_email` is provided by admin and already exists under the Zoom org.

### Technical notes
- Tables get explicit `GRANT`s + RLS in a single migration; new `closer` role added to enum.
- Slot capacity calculation runs server-side and re-checks at booking time to prevent races (unique partial index on `(slot_start, assigned_closer_id)` once assigned).
- Zoom call wrapped in try/catch — if Zoom fails on assignment, the row stays `assigned` with `zoom_join_url=null` and admin sees a "Retry Zoom" button.
- Reuses existing `slot-picker`, `availability-editor`, `date-time-picker` components.
