## DM Setter role — implementation plan

A new account type on the B2C side that tracks Instagram/TikTok DM outreach, owns leads via a personal `/apply` link, and earns commission when their attributed B2C lead closes. Managers oversee a group of DM setters and earn an override.

---

### 1. New roles & data model

**New Postgres enum values** on `app_role`: `dm_setter`, `dm_setter_manager`.

**New tables** (all under `public`, with GRANTs + RLS as per project rules):

- `dm_setters`
  - `user_id` (FK to auth.users, unique), `manager_id` (FK to `dm_setters.user_id`, nullable — a manager row also lives here with `is_manager = true`)
  - `is_manager boolean default false`
  - `apply_slug text unique` — used for `/apply?dm=<slug>` (generated on account creation)
  - `email`, `full_name` denorm mirrors for admin lists
- `dm_daily_logs` — one row per setter per day
  - `dm_setter_id`, `log_date`, `ai_count int`, `manual_adjustment int default 0`, `total generated column`, `target int default 100`
- `dm_log_uploads` — each screenshot upload
  - `dm_daily_log_id`, `image_path` (storage), `platform` (`instagram` | `tiktok` | `other`), `ai_count int`, `ai_raw jsonb`, `status` (`processing`|`counted`|`failed`), `created_at`
- Extend `leads`: add `dm_setter_id uuid null`, `dm_setter_locked_at timestamptz` (set on first attribution so re-applications don't overwrite).
- Extend `commissions` (B2C): allow `role = 'dm_setter' | 'dm_setter_manager'` alongside existing closer entries. Percentages: 7.5% and 2.5% of B2C deal amount.

**Storage bucket:** private `dm-screenshots` bucket, path `dm/<user_id>/<yyyy-mm-dd>/<uuid>.jpg`. RLS: setter can read/write their own folder; managers can read their DM setters' folders; admins read all.

---

### 2. Onboarding & apply link

- Admin "Setters" area on the **B2C tab** gets two new sections: **DM Setter Managers** and **DM Setters**. Same invite flow already used for closers/setters (email invite → set password → forced first-login change).
- On DM setter creation: generate an `apply_slug` (short, URL-safe) and expose their link as `https://<domain>/apply?dm=<slug>`. Show it prominently on their dashboard with a copy button.
- Admin panel: assigning a DM setter to a manager is a dropdown on the DM setter row (list of `is_manager=true` DM setters).
- On DM setter manager creation: same invite flow, no apply link.

---

### 3. `/apply` attribution

- `/apply` page reads `?dm=<slug>` (fallback to referrer field only when no slug present) and shows the DM setter's name ("Referred by …") instead of the current free-text "Referred by".
- On submit, the created lead gets:
  - `dm_setter_id = <setter for slug>`
  - `dm_setter_locked_at = now()`
  - **Only if lead is brand new.** If the applicant matches an existing lead (email match), keep the existing `dm_setter_id` untouched.
- The DM setter follows the lead through the pipeline automatically — no re-assignment needed for booking, no-show, close, DQ, not-interested. All existing lead status transitions already stamp `last_status_change_at`; we just carry `dm_setter_id` forward.

---

### 4. Commissions

- Extend `setAppointmentOutcome` (B2C path) so when outcome is set to `closed` on an appointment whose lead has `dm_setter_id`:
  - Create a `pending` commission for the DM setter at 7.5% of deal amount, `role='dm_setter'`.
  - If that DM setter has a `manager_id`, also create a `pending` commission at 2.5% for the manager, `role='dm_setter_manager'`.
- Clearing/changing outcome away from `closed` deletes those two commission rows (mirrors current closer behavior).
- **B2C commissions page** (admin): the "DM Setter" column that currently shows "Not recorded" now shows the real DM setter (and, under it, the manager as a secondary chip). Both entries appear in Pending approval, All entries, and Payouts flows — no separate UI, same approval/payout mechanics as closer commissions today.

---

### 5. DM setter app (new profile type)

New sidebar/nav item set for `dm_setter` role. Routes under `src/routes/app/_authenticated/dm/`:

- **Home / dashboard**
  - Today's DM count with progress ring toward 100 target, big "Upload screenshots" button.
  - Clickable KPI cards for their attributed leads over a selectable date range (default: today, with Today / 7d / 30d / All shortcuts — same date picker component we already use):
    - Applications, Booked, No show, Closed, Disqualified, Not interested, Close rate.
  - Clicking a card opens a filtered list of those leads with the standard lead detail dialog.
  - Apply link with copy button.
- **DM log** page: history table by day, expandable to show each screenshot, its AI count, and status. Setter can re-run AI on a failed upload.
- **Commissions**: same layout as closer commissions, showing 7.5% entries.
- **Profile**.

**Screenshot → AI count flow:**
1. Setter picks platform (Instagram / TikTok) and drops N images.
2. Client uploads each to `dm-screenshots` bucket, inserts a `dm_log_uploads` row with `status='processing'`.
3. Server function `countDmsInScreenshot` calls Lovable AI (`google/gemini-2.5-flash` multimodal) with a strict prompt returning `{ count: number, confidence: "high"|"medium"|"low", notes?: string }`. Uses signed URL, JSON output via `Output` API.
4. Writes `ai_count` + `ai_raw` back, upserts today's `dm_daily_logs` row summing all uploads, sets status.
5. Failed uploads (bad image, no messages detected) show a "retry" button.
6. Admin has a "manual adjustment" field on a setter's daily log to correct the total; the total shown to setter and admin is `ai_count + manual_adjustment`.

---

### 6. Manager app

`dm_setter_manager` role gets its own nav:
- **Team dashboard**: list of assigned DM setters with today's DM count, MTD DMs, attributed leads by status, closes, and manager commission earned in selectable range.
- Clicking a setter opens the same profile view admins see (read-only).
- **Commissions**: their own 2.5% entries.
- **Profile**.

---

### 7. Admin B2C — DM setter profile view

New route `admin/dm-setters.$userId.tsx` matching current closer/setter detail dialogs:
- Header: name, email, manager, apply link, invite status.
- Date range selector (Today / 7d / 30d / All + custom).
- KPI cards (clickable, filter list below): Applications, Booked, No Show, Closed, DQ, Not Interested, Close rate, Commission earned in range.
- DM activity card: daily DMs bar chart + total DMs in range + manual adjustment control.
- Screenshot log with AI counts (admin can also override).
- List of attributed leads with existing lead detail dialog.

Managers get an equivalent listing page grouped by manager.

---

### 8. Technical section

Files added:
- `supabase/migrations/<ts>_dm_setter_role.sql` — enum values, tables, GRANTs, RLS, storage bucket, indexes on `leads.dm_setter_id`, `dm_daily_logs (dm_setter_id, log_date)`.
- `src/lib/api/dm-setters.functions.ts` — `createDmSetter`, `createDmSetterManager`, `assignManager`, `listDmSetters`, `getDmSetterProfile`, `getDmSetterStats(range)`, `getManagerTeamStats`, `uploadDmScreenshot`, `countDmsInScreenshot`, `adjustDailyLog`, `getMyDmLogs`, `getMyApplyLink`.
- `src/lib/api/apply.functions.ts` (or extend existing) — accept `dmSlug`, resolve to `dm_setter_id`, enforce "new lead only" attribution.
- `src/lib/api/cl.functions.ts` — extend `setAppointmentOutcome` B2C branch to create/delete DM setter + manager commissions.
- `src/lib/api/cl.functions.ts` `getMe` — return `isDmSetter`, `isDmSetterManager`, and (for DM setters) `applyLink`.
- New routes under `src/routes/app/_authenticated/dm/` and `src/routes/app/_authenticated/dm-manager/` plus admin routes.
- `src/components/app-sidebar.tsx` + `bottom-nav.tsx` — new nav item sets, extend `AppSidebar` props (`isDmSetter`, `isDmSetterManager`).
- `src/routes/app/_authenticated/route.tsx` — pass the new role flags.
- `src/routes/apply.tsx` — read `dm` query param, resolve name via a public read-only server fn using the publishable-key client (narrow `TO anon` SELECT on `dm_setters(apply_slug, full_name)`), replace the "Referred by" input.
- Route gates for `/app/dm/*` and `/app/dm-manager/*` mirror existing `_authenticated` closer/setter gates.
- Storage bucket created via `storage_create_bucket` (private), RLS policies via migration.

AI counting call uses the AI Gateway from a `createServerFn` handler with `google/gemini-2.5-flash-image` input support; JSON schema output; request includes the signed URL of the uploaded screenshot.

Manager assignment UI is a simple `<Select>` on the DM setter admin row that calls `assignManager({ dmSetterId, managerId })`.

No changes needed to existing closer/setter code beyond the outcome hook and the B2C commissions page column rendering.
