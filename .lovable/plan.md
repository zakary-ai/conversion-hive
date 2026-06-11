# Public Apply Page + Admin Applications Inbox

A self-contained new system. Touches no existing tables, routes, or admin pages.

## 1. Database — new `applications` table

Fields:
- `full_name` (text)
- `phone` (text)
- `why_remote_sales` (text) — "Why do you want to get into remote sales?"
- `current_monthly_income` (text) — keep as text so users can write "$3k", "2000 USD", etc.
- `desired_monthly_income` (text)
- `open_to_invest` (enum: Yes / No / Maybe)
- `credit_score_range` (enum: 600-650, 650-700, 700-750, 750-800, 800-850)
- `status` (enum: New, No Answer, Follow Up, Booked, Not Interested) — defaults to `New`
- `admin_notes` (text, nullable)
- `created_at`, `updated_at`

Security:
- RLS on, anon `INSERT` allowed (with light rate hygiene — required-field constraints + length limits).
- Admin role: full `SELECT/UPDATE/DELETE`.
- No public `SELECT`. Submitter never reads back.

## 2. Public page — `/apply`

Top-level route (outside `_authenticated`), SSR on, full marketing copy + form. Uses the exact copy you provided:

- Headline: "Apply Now"
- Subhead about driven sales people, training included, etc.
- Three feature cards: Training Included / Appointment Setting / Earn Commission
- "Takes under 2 minutes. You will receive a phone call within 24 hours."
- Form fields in this order:
  1. Full name
  2. Phone number
  3. Why do you want to get into remote sales? (textarea)
  4. How much do you earn monthly?
  5. How much do you want to earn monthly?
  6. Are you open to invest into yourself to get there? (Yes / No / Maybe)
  7. Credit score? (600-650 … 800-850)
- "Submit application" button → calls a public `createServerFn` that inserts via `supabaseAdmin`. Zod-validated.
- Success state replaces the form with a confirmation message.
- SEO `head()` with title + description.
- No nav/sidebar chrome — standalone landing page.

## 3. Admin — new "Applications" section

New route: `/_authenticated/admin/applications` (added to admin sidebar). Completely separate from Leads.

List view:
- Table of all submissions, default sort: most recent first.
- Sort dropdown: Newest, Oldest, Name A–Z, Status.
- Filter by status (All / New / No Answer / Follow Up / Booked / Not Interested).
- Search by name / phone.
- Each row: name, phone, status pill, submitted date, click → opens detail dialog.

Detail dialog (per applicant):
- All submitted fields, read-only.
- Editable status dropdown (New, No Answer, Follow Up, Booked, Not Interested).
- Editable internal admin notes textarea.
- Save button → updates row.
- Delete button (with confirm).

## 4. Files

New:
- `supabase/migrations/<ts>_applications.sql` — table, enums, RLS, grants, updated_at trigger.
- `src/lib/api/applications.functions.ts` — `submitApplication` (public), `listApplications`, `updateApplication`, `deleteApplication` (admin-gated).
- `src/routes/apply.tsx` — public page + form.
- `src/routes/_authenticated/admin/applications.tsx` — admin list + detail dialog.

Edited:
- `src/components/app-sidebar.tsx` — add "Applications" link under admin.

## 5. Isolation guarantees

- Does not touch `leads`, `profiles`, `appointments`, `commissions`, training tables, or any existing admin pages.
- New status enum is separate from the Leads status set.
- No shared functions with existing lead workflow.
