
## Overview

Two email changes on the B2B booking flow:

1. **New email** — sent right after a setter books a call onto the B2B calendar (before a closer is assigned).
2. **Edit existing email** — the closer-assigned email (`booking-confirmation`) gets a Loom video block and a "Confirm my booking" button. Clicking the button lands the lead on a public "thanks" page and flips the appointment to confirmed so closers can see the status.

Loom URL: `https://www.loom.com/share/ad9a5d9b3d13417ea1f05e22dcc52799`

Both emails greet the lead by name and show the date/time formatted in the timezone the setter selected during booking.

## What gets built

### 1. New template `booking-received` (setter booked, pre-assignment)

- File: `src/lib/email-templates/booking-received.tsx`, registered in `registry.ts`.
- Reuses brand styles from the existing `booking-confirmation` template.
- Content: greeting with lead's name, "Thanks for booking — here are your details", scheduled time formatted in the selected timezone, duration, and a note that a Zoom link is coming once a closer is assigned. No Zoom or confirm buttons.

**Trigger:** `createAppointment` in `src/lib/api/cl.functions.ts`. When `data.type === "booking"` and insert succeeds, fire `sendTransactional({ templateName: 'booking-received', ... })`. Idempotency key `booking-received-<appointmentId>`.

### 2. Edit `booking-confirmation` template (closer assigned)

- Add a Loom card section (thumbnail + play overlay, linked to the Loom URL) below the meeting details. Loom's public thumbnail URL pattern is used so the image renders inline in email clients.
- Add a second CTA button below "Join Zoom call": **"Confirm my booking"** → `https://conversionlab.space/confirm-booking?token=<token>`.
- Both emails format the date/time using the appointment's stored timezone (see technical notes) instead of hardcoded EST.
- Preview data updated so the admin email preview dialog still renders (includes a sample `confirmUrl` and Loom URL).

### 3. Confirmation link + token

Migration adds to `public.appointments`:
- `confirmation_token text` with a unique index (nullable)
- `confirmed_at timestamptz` (nullable)

Inside `sendBookingConfirmationEmail`, before rendering: mint a 32-byte hex token (same pattern as unsubscribe tokens), store it on the appointment via `supabaseAdmin`, then pass `confirmUrl` into the template.

### 4. Public confirm route + landing page

- `src/routes/api/public/confirm-booking.ts` (POST) — `/api/public/*` bypasses auth. Takes `{ token }`, uses `supabaseAdmin` to look up the appointment; sets `confirmed_at = now()` if not already set. Idempotent. Returns `{ ok, alreadyConfirmed, leadName, scheduledLabel }`.
- `src/routes/confirm-booking.tsx` — public page that reads `?token=` on mount, POSTs to the API route, then shows one of: "Thanks for confirming your call, <name> — see you on <scheduledLabel>", "You've already confirmed this call", or "This confirmation link is invalid". No auth required.

### 5. Show confirmed status to closers

- Extend closer calendar / appointment queries to select `confirmed_at`.
- `src/routes/app/_authenticated/closer/calendar.tsx` and `src/components/appointment-detail-dialog.tsx`: render a green "Confirmed" badge when `confirmed_at != null`, muted "Not confirmed" otherwise, on B2B booking rows.

## Timezone handling

The appointment already carries a timezone chosen at booking time via `callback_slot_picker` / booking flow. For appointments where the field exists (e.g. `timezone` / `booked_timezone` on `appointments`), both emails format `scheduledLabel` with that timezone using `Intl.DateTimeFormat`. If the field is missing on legacy rows, we fall back to `America/New_York` (current behavior). I'll confirm the exact column name during build by reading the schema; if it's not yet stored on `appointments`, I'll add it in the same migration and populate it from the booking payload in `createAppointment`.

## Technical notes

- Migration adds `confirmation_token` (unique) and `confirmed_at`, plus `timezone text` on `appointments` if not already present. No new RLS: writes happen via `supabaseAdmin` in the public route; reads use existing appointment policies.
- Confirm route validates the token exists and returns only first-name + scheduled label — no other PII.
- Idempotent confirm: re-clicking returns `alreadyConfirmed: true`.
- Loom block is a static `<a><img/></a>` (Loom's public thumbnail) — no `<iframe>`/`<video>` since email clients strip them.

## Files touched

- **new** `src/lib/email-templates/booking-received.tsx`
- **edit** `src/lib/email-templates/booking-confirmation.tsx` (Loom + confirm button + `confirmUrl` prop + timezone-aware label)
- **edit** `src/lib/email-templates/registry.ts`
- **edit** `src/lib/api/cl.functions.ts` (fire new email on booking; mint/store token + pass `confirmUrl` on assignment; use booking timezone)
- **new** `src/routes/api/public/confirm-booking.ts`
- **new** `src/routes/confirm-booking.tsx`
- **edit** closer calendar route + appointment detail dialog (Confirmed badge)
- **migration** add `confirmation_token`, `confirmed_at` (and `timezone` if missing) on `appointments`
