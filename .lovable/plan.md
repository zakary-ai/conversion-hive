# Manager calendars with their own closers

Give each DM setter manager the same setup the main sales calendar has: their own closers, and the ability to assign booked calls to one of them.

## What managers get

- A **My closers** section on the manager's calendar page: invite a closer by name and email, toggle them active, remove them, and set their weekly availability.
- Invited closers get a login email with a temporary password, exactly like company closers do today.
- Each call booked on the manager's link now shows an **Assign closer** picker. Assigning creates the Zoom link on that closer's own Zoom account (falling back to the manager's Zoom, then the company account), adds a calendar event, and emails both the applicant and the closer with the details.
- **Reassign** puts the call back to unassigned; the call keeps working.
- Outcome tracking stays simple: scheduled, completed, no show, cancelled. No commission records for these calls for now.

## What their closers get

- Their existing closer workspace, but scoped to their manager: they see only the calls their manager assigned to them, plus their own availability and Zoom connection card.
- A closer belonging to a manager never appears in the company sales calendar's assign list, and company closers never appear in a manager's list.

## Admin view

The existing Manager calendars page also shows who each call is assigned to, so you can see coverage across all managers at a glance.

## Technical notes

- Migration: add nullable `owner_manager_id` (references `dm_setters`) to `public.closers`; add `assigned_closer_id` (references `closers`), `zoom_join_url`, `zoom_meeting_id` to `public.dm_manager_bookings`. RLS policies so a manager can read/write only closers where `owner_manager_id` equals their own setter id, and a closer can read their own manager bookings.
- Existing company closers keep `owner_manager_id = null`. Every existing company-closer query is filtered to `owner_manager_id is null` so the main sales calendar behaviour is unchanged.
- New server functions in `src/lib/api/dm-manager.functions.ts`: `listMyClosers`, `inviteMyCloser`, `updateMyCloser`, `deleteMyCloser`, `getMyCloserAvailability` / `saveMyCloserAvailability`, `assignCloserToManagerBooking`, `unassignManagerBooking` - all gated by the existing `requireManager` helper plus an ownership check on the closer row.
- Assignment reuses `createZoomMeetingOnCloserAccount` and the manager Zoom fallback already in `src/lib/dm-manager-booking.server.ts`, and reuses the existing closer-invite and booking-confirmation email templates.
- Closer-side queries in `src/routes/app/_authenticated/closer/*` gain the manager-booking source so a manager's closer sees their assigned calls.
