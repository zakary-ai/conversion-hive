# Send info email + per-setter booking link (B2B)

## What you get

1. A new **"Send email with information"** button in the Log call outcome dialog on a setter's lead.
   - Sends the lead a branded email summarizing the ChatGPT Ads one-pager (what ChatGPT ads are, why the timing matters, what Open ROAS does) with a **Book an intro call** button pointing at that setter's own booking link.
   - It logs the attempt on the lead's history as "Info emailed" so the lead stays in the setter's queue and the admin lead view shows it.
   - Editable email field before sending, in case the lead's email is missing or wrong (same pattern as the booking dialog).

2. Every B2B setter gets a **personal external booking link** (e.g. `conversionlab.space/book/korin-h-8fd2`).
   - Public page, no login, mobile-friendly: pick a date, pick a time, enter name / email / phone / company, confirm.
   - Time slots come from the exact same B2B calendar logic the setters use internally (master B2B window + only closers with a connected Google Calendar who are actually free), so a lead can never book a slot the setter couldn't book.
   - Booking through it runs the same flow as an internal booking: assigns an available closer, creates the Zoom link, adds the event to the closer's Google Calendar, emails the closer and the prospect.
   - The setter who owns the link is recorded as the setter on that booking, so it shows in their booked-calls stats and in admin.
   - Setters see and can copy their link from their dashboard / lead pages; admin can see each setter's link on the setter detail page.

## Technical notes

- **Migration**: add `b2b_booking_slug` (text, unique, nullable) to `profiles`, backfilled for existing B2B setters; add `info_emailed` to the `b2b_call_outcome` enum; allow `b2b_lead_pool.claimed_by` attribution for publicly-created leads.
- **Email template**: new `src/lib/email-templates/chatgpt-ads-info.tsx` (React Email, brand styling matching existing templates, white `Body`), registered in `src/lib/email-templates/registry.ts`. Props: lead name, setter name, booking URL. Text-only content from the one-pager — no attachment (attachments aren't supported).
- **Server fns** (`src/lib/api/b2b-pool.functions.ts`): `sendLeadInfoEmail` (auth, ownership-checked, `sendTransactional` with idempotency key `b2b-info-<leadId>-<timestamp>`, inserts a `b2b_call_attempts` row with `info_emailed`), and `getMyBookingLink` / slug generation on first use.
- **Public booking**: new route `src/routes/book.$slug.tsx` (public, SSR) plus public server fns in a new `src/lib/api/public-booking.functions.ts`:
  - `getPublicSetterBySlug` — resolves slug to setter, 404 page if unknown.
  - `listPublicB2bSlots` — refactor the existing `listAvailableSlots` body in `src/lib/api/cl.functions.ts` into a shared server-only helper so the authenticated and public versions share one implementation (no duplicated availability logic).
  - `bookPublicB2bSlot` — creates/finds a `b2b_lead_pool` row claimed by the link's setter, then calls the shared booking core extracted from `bookB2bSlotForLead` (closer pick, Zoom, Google Calendar, closer + prospect emails, `b2b_call_attempts` outcome `booked`, pool status `booked`).
  - Input validated with Zod, slot re-validated server-side against availability before writing, so a stale page can't double-book.
- **UI**: `src/components/log-call-outcome-dialog.tsx` gets the new menu entry and confirm screen; a small "Your booking link" copy control added to the setter dashboard (`src/routes/app/_authenticated/dashboard.tsx`) and to the admin setter detail page.
- Public route gets its own `head()` metadata (title/description/OG) since it's a shareable link.
