# Conversion Lab — MVP Plan

A dark, premium SaaS platform with two roles (Admin, Client) covering training modules, quizzes, leads, and commissions. Backend on Lovable Cloud (Postgres + Auth + RLS). Frontend in TanStack Start with a polished dark dashboard UI.

## 1. Backend (Lovable Cloud)

Enable Cloud, then create these tables with RLS.

**Roles model (secure)**
- `app_role` enum: `admin`, `client`
- `user_roles(user_id, role)` + `has_role(uuid, app_role)` SECURITY DEFINER function (roles never stored on profiles).

**Tables** (as specified)
- `profiles` (id, user_id, full_name, email, company_name, created_at)
- `modules` (id, title, description, video_url, order_index, is_active, created_at)
- `module_completions` (id, user_id, module_id, completed_at)
- `quiz_questions` (id, module_id, question_text, options jsonb, correct_answer, created_at)
- `quiz_attempts` (id, user_id, module_id, score, answers jsonb, completed_at)
- `leads` (id, assigned_user_id, name, phone, email, company, source, status, notes, contacted_at, created_at)
- `commissions` (id, user_id, amount numeric, note, added_by, created_at)
- `scraper_runs` (id, user_id, leads_added, status, ran_at)

**RLS policies**
- Clients: SELECT/UPDATE only their own rows in `leads` (status + notes only), `module_completions`, `quiz_attempts`; SELECT-only on their `commissions` and `profiles`.
- Modules + quiz_questions: SELECT for any authenticated user; INSERT/UPDATE/DELETE for admins only.
- Commissions/leads writes (insert, assign, delete): admins only via `has_role(auth.uid(),'admin')`.
- Profiles auto-created via `handle_new_user` trigger on `auth.users`.

**Seed dummy data**: 1 admin, 2 clients, ~5 modules with quizzes, ~75 leads per client, sample commissions.

## 2. Auth

- Email/password sign-in (no Google for MVP unless requested).
- `/auth` public route (login + signup tabs).
- `_authenticated/` integration-managed gate.
- Role-based redirect: admins → `/admin`, clients → `/dashboard`.
- `_authenticated/_admin/` pathless layout gating admin routes via `has_role`.

## 3. Routes

Client (`_authenticated/`):
- `/dashboard` — welcome, today's lead count, contacted today, remaining, training %, commission balance, quick links
- `/training` — module grid; `/training/$moduleId` — video + notes + mark complete + link to quiz
- `/quizzes` — list; `/quizzes/$moduleId` — MCQ flow, score, retake, attempt history
- `/leads` — table with status filter, search, status update, notes, contacted toggle
- `/commissions` — total + entries list
- `/profile`

Admin (`_authenticated/_admin/`):
- `/admin` — totals, recent activity, quick links
- `/admin/clients` — list + detail (their leads, progress, quiz scores, add commission)
- `/admin/modules` — CRUD
- `/admin/quizzes` — per-module question CRUD
- `/admin/leads` — all leads, assign, manual add, edit, delete, filter by client/status
- `/admin/commissions` — add commission to client
- `/admin/settings`

## 4. Data Access

- `createServerFn` + `requireSupabaseAuth` for all reads/writes.
- TanStack Query + `ensureQueryData` / `useSuspenseQuery` per route.
- Mutations invalidate relevant query keys.

## 5. Design System

Dark premium SaaS — black/dark navy background, blue accent, white/gray text, sharp card spacing.
- Define tokens in `src/styles.css` (`oklch`): `--background` deep navy-black, `--card` slightly lifted, `--primary` electric blue, `--border` subtle white/8%.
- Typography: Space Grotesk display + Inter body (loaded via `<link>` in root).
- Sidebar layout via shadcn `Sidebar` with collapsible icon mode; topbar with `SidebarTrigger`, user menu, role badge.
- Card-based dashboards with stat tiles (icon + label + value + delta), data tables, status pills (color-coded lead statuses), progress bars for training.
- Fully responsive; sidebar collapses to offcanvas on mobile.

## 6. Components

- `StatCard`, `SectionHeader`, `StatusBadge`, `ProgressRing`, `DataTable` (with filter/search), `VideoEmbed`, `QuizRunner`, `LeadDrawer` (edit notes/status), `CommissionList`, `EmptyState`.
- Two sidebars: `ClientSidebar`, `AdminSidebar`, picked by role in `_authenticated/route.tsx` shell.

## 7. Build Order

1. Enable Cloud, migrations (tables + RLS + roles + trigger + seed).
2. Design tokens + fonts + sidebar shell + auth pages.
3. Server fns for profiles/role + role-based redirect.
4. Client dashboard + training + quizzes.
5. Leads page (filter/search/update).
6. Commissions (read).
7. Admin dashboard + clients + modules + quizzes mgmt.
8. Admin leads + commissions mgmt.
9. Seed dummy data; QA both roles.

## Open questions before I build

1. **Signup**: should new signups default to Client role (admin promotes later), or should signup be admin-invite-only? (I'll default to "anyone can sign up as Client; first admin seeded manually" unless you say otherwise.)
2. **Video hosting**: assume YouTube/Vimeo embeds (iframe by URL)?
3. **Scraper**: confirm we just stub `scraper_runs` and a "75 leads/day available" counter for now (no actual scraping).
4. **Google sign-in**: skip for MVP, or include alongside email/password?

If you're good with the defaults above, say "go" and I'll build it.
