
## Scope
File: `src/routes/app/_authenticated/admin/clients.$userId.tsx` (the setter detail page, opened from the B2B → Setters tab).

## Changes

### 1. Replace Day / Week / Month / 90d / All toggle with Today or Date Range
- Remove the `RANGES` pill toggle.
- Add two controls:
  - "Today" button (quick preset).
  - Date range picker: a single `Popover` with a `Calendar mode="range"` and a formatted label like `Jun 20 – Jul 1`.
- Convert `Range` type to `{ from: Date; to: Date }`; default to All time on first load (keeps existing behavior), with Today and custom range as options.
- Pass the resolved `from`/`to` (ISO) to `getClientDetail`. Server side already supports `range`; we'll extend the payload to also accept `{ from, to }` and filter server-side. (Small addition in `cl.functions.ts` — keep the existing `range` param for backward compat, add optional `from`/`to`.)

### 2. Stat tiles — new set, all clickable
Replace the current two rows of 4 tiles with a single grid of 6 tiles:
`Bookings · Closed · Lost/DQ · No Show · Dials · Training`
- Remove: Total earned, Paid out, Unpaid (all commission-related).
- Lost/DQ = existing `stats.lost` (rename label only).
- No Show = new stat from `data.appointments` where `outcome === "no_show"` (or equivalent). Add to server aggregate.
- Training tile keeps `${progress}%`.
- Each tile becomes a button that opens a modal listing the underlying records:
  - Bookings → list of appointments (all types "booking") within selected range.
  - Closed → appointments where outcome = closed.
  - Lost/DQ → outcome = lost / dq.
  - No Show → outcome = no_show.
  - Dials → the `calls` list within range.
  - Training → list of completed modules + attempts, or link to training progress card.

Modal will be one reusable `StatDetailDialog` that accepts a title and rows; each row shows name/company/date and, for calls, uses the existing `CallRow` component.

### 3. Remove commission UI entirely
- Delete "Add commission" card (right column of the training/commission grid). Training progress becomes full width.
- Delete "Commission history" card, `PayDialog`, `UnpayButton`, `PAY_METHODS`, related `useState` (`amount`, `note`, `payTarget`), and the `add`/pay mutations.
- Remove now-unused imports: `addCommission`, `setCommissionPaid`, `Textarea`, `Label`, `Input` (if fully unused), `DialogFooter`, `BadgeCheck`, `RotateCcw`, `DollarSign`, `Clock` (keep if still used elsewhere), `money` (keep if still used).

### 4. Booking history → clickable, date-driven
- Convert the Booking history card header to include a date picker button (single date) matching the existing `LeadHistoryCard` pattern.
- The list filters to bookings whose `scheduled_at` falls on the selected date.
- Rows remain clickable → open an appointment detail dialog showing name, company, scheduled time, outcome, deal amount, notes. (Reuse a simple inline dialog; no need for the full `appointment-detail-dialog` component unless it fits.)

### 5. Quiz scores — collapsible, start minimized
- Wrap the Quiz scores card body in `Collapsible` with `defaultOpen={false}`.
- Header becomes a `CollapsibleTrigger` with a chevron.

### 6. Today's Leads — add minimize/collapse
- Wrap `TodaysLeadsCard` content in `Collapsible` with `defaultOpen={true}` (visible by default, but user can minimize).
- Header row keeps tabs + search; add a chevron toggle. Tabs/search stay visible in the header even when collapsed? → keep it simple: header always visible, only the table collapses.

## Server-side (`src/lib/api/cl.functions.ts`)
- `getClientDetail`: accept optional `from` / `to` ISO strings alongside `range`. When provided, filter appointments/leads/calls/commissions by that window.
- Add `no_show` count to `stats` (count appointments where `outcome = 'no_show'`).
- No schema changes; no migration needed.

## Out of scope
- No changes to any other admin tab (B2B Closers, B2B Commissions, etc.).
- No changes to how commissions are recorded elsewhere — only the UI on this page is removed.
- No mobile-specific redesign beyond what the existing responsive classes already provide.

## Confirmations needed
1. "Delete all commission sections" — confirming this means removing the Total earned / Paid out / Unpaid tiles, Add commission card, and Commission history card from **this setter detail page only**. The global Admin → Commissions page stays. Correct?
2. For the No Show tile — should it count appointments with outcome exactly `no_show`, or also include a separate status? (I'll use `no_show` unless you say otherwise.)
