# Plan

Update the DM manager calendar so managers can assign a booked call to themselves and keep the calendar visible.

## Changes
- Add a “Me” option to the assignment menu for each unassigned manager booking.
- When “Me” is selected, create or reuse a private closer record for that manager and assign the booking to it.
- Show self-assigned calls as assigned to “Me” on the manager calendar.
- Keep the date calendar visible at the top of the My Calendar tab instead of hiding it behind a dropdown.
- Keep weekly availability collapsible below the visible calendar, then show closers below that.

## Technical details
- Add a server function that ensures the manager has a self-owned closer row linked to their user account, then reuses the existing assignment flow.
- Adjust the assignment conflict check so self-assigned calls are prevented from double-booking the manager at the same time.
- Update the manager calendar UI to render the calendar component directly instead of inside a popover.
- Avoid changing the main sales calendar or non-manager closer flow.

## Validation
- Typecheck the touched files.
- Open the DM manager calendar and confirm the visible calendar, “Me” assignment option, and assigned label render correctly.
