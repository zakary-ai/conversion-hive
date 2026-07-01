
## Goal

Give each closer (B2B and B2C) a place on their own account to declare weekly availability and free-form notes. Give admins a read/edit view of that same data on the B2B Calendar tab and the B2C Bookings → Calendar tab. This is informational only — it does NOT change any existing scheduling or booking logic.

## Why a new table (not existing availability rules)

The current `availability_rules`, `b2b_closer_availability_rules`, `b2c_availability_rules`, and `closer_availability_rules` tables drive real booking windows. Reusing them would change what leads/setters can book. To keep behavior identical, I'll add a new isolated table used only by this UI.

## Data model

New table `closer_availability_declarations` (one row per closer per business line):

- `closer_user_id` (uuid, FK to auth users)
- `line` — enum-ish text: `'b2b'` or `'b2c'`
- `weekly` — jsonb: 7 entries `[{ day, enabled, ranges: [{start_minute, end_minute}] }]`
- `notes` — text
- `updated_at`, `updated_by`
- Unique(`closer_user_id`, `line`)

RLS:
- Closers: read/write their own row for whichever line they belong to.
- Admins: read/write any row.
- GRANTs to `authenticated` + `service_role`.

Nothing else in the app queries this table, so scheduling is untouched.

## Server functions (new `src/lib/api/closer-availability.functions.ts`)

- `getMyAvailabilityDeclaration({ line })` — closer reads own.
- `saveMyAvailabilityDeclaration({ line, weekly, notes })` — closer upsert own.
- `listAvailabilityDeclarations({ line })` — admin lists all closers for a line, joined with closer name/email (from `closers` / `b2b_closers`).
- `adminSaveAvailabilityDeclaration({ closer_user_id, line, weekly, notes })` — admin upsert.

All use `requireSupabaseAuth`; admin ones check `has_role(admin)`.

## Shared UI component

`src/components/closer-availability-editor.tsx` — a reusable editor with:
- The same 7-day / time-range pattern used by `B2bCalendarPanel` (Switch per day, add/remove ranges, `toTime` / `fromTime` helpers, Eastern Time label).
- A `Textarea` for notes.
- Props: `weekly`, `notes`, `onChange`, `readOnly?`, `title`, `subtitle`.

## Closer account changes

`src/routes/app/_authenticated/closer/index.tsx`
- Add a collapsible "My availability & notes" card below the stat grid.
- Show two sections when the closer belongs to both lines (query `me` roles + closer records): B2B and B2C. If only one, show one.
- Uses the shared editor + Save button, wired to `saveMyAvailabilityDeclaration`.

## Admin changes

- **B2B** (`src/components/admin/b2b-calendar-panel.tsx`): add a new collapsible "Closer availability (declared)" card near the existing weekly-availability card. Lists all B2B closers via `listAvailabilityDeclarations({ line: 'b2b' })`. Each closer expands into the shared editor in edit mode with a Save button that calls `adminSaveAvailabilityDeclaration`. A small "informational only — does not change booking hours" hint.
- **B2C** (`src/components/admin/b2c-calendar-panel.tsx`, which renders in the Bookings → Calendar tab): identical card, `line: 'b2c'`, listing B2C closers.

## Non-goals

- No change to `availability_rules`, `b2b_closer_availability_rules`, `b2c_availability_rules`, `closer_availability_rules`, slot generation, booking flow, apply flow, or email.
- No changes to how closers are assigned to bookings.

## Technical notes

- The `weekly` jsonb has a fixed 7-entry shape; the editor normalizes empty ranges before save.
- Times stored in minutes-from-midnight, Eastern Time semantics (matches existing panels).
- Empty state on both closer and admin views: "No availability set yet."
- No migration data backfill needed (empty rows appear on first save).

## Files touched

- new migration for `closer_availability_declarations` + RLS + GRANTs
- new `src/lib/api/closer-availability.functions.ts`
- new `src/components/closer-availability-editor.tsx`
- edited `src/routes/app/_authenticated/closer/index.tsx`
- edited `src/components/admin/b2b-calendar-panel.tsx`
- edited `src/components/admin/b2c-calendar-panel.tsx`
