
## Outbound Lead Management — schema + admin listing

Adds the full outbound data model with `ob_` prefix so it doesn't collide with the existing inbound `leads` / `appointments` tables. Backend + one admin table only — no other UI yet.

### 1. New role & section

- Add `setter` to the `app_role` enum (distinct from `dm_setter`). This is the "normal setters who have the dials" audience for this system.
- Add a top-level nav section labeled **Emails** available to `admin` and `setter` (and `dm_setter_manager` if you want visibility — I'll default to admin + setter; say the word to include managers).
- Route: `/app/emails` (setter's own dashboard) and `/app/admin/emails/leads` (admin listing built in this pass).

> Confirm before I run the migration: is `setter` a brand-new role, or should I reuse `closer`? Your wording implies new. I'll assume new unless you say otherwise.

### 2. Tables (all prefixed `ob_`)

Exact fields from your spec, with the two colliding names renamed:

- `ob_companies`
- `ob_leads` (was `leads`)
- `ob_campaigns`
- `ob_campaign_memberships` — unique `(lead_id, campaign_id)`
- `ob_conversations`
- `ob_messages`
- `ob_outreach_activities`
- `ob_call_attempts`
- `ob_linkedin_tasks`
- `ob_appointments` (was `appointments`)
- `ob_suppression_list` — indexes on `email`, `domain`
- `ob_webhook_events` — unique `(source, external_event_id)` where present

All enums created as Postgres enums (`ob_email_status`, `ob_lead_status`, `ob_campaign_channel`, `ob_membership_status`, `ob_conversation_category`, `ob_message_direction`, `ob_activity_type`, `ob_call_outcome`, `ob_linkedin_task_type`, `ob_linkedin_task_status`, `ob_appointment_status`, `ob_suppression_reason`, `ob_campaign_status`).

Every table gets `created_at`; `ob_leads` and `ob_campaigns` also get `updated_at` with the existing `update_updated_at_column()` trigger.

`owner_setter_id` on `ob_companies` and `ob_leads` references `profiles.user_id` (matches how the rest of the app maps ownership to auth users).

### 3. RLS (per your answer: setter sees own, admin sees all)

For `ob_companies`, `ob_leads`, `ob_campaigns`, `ob_appointments`, `ob_call_attempts`, `ob_linkedin_tasks`, `ob_outreach_activities`:

- SELECT / INSERT / UPDATE / DELETE where `owner_setter_id = auth.uid()` OR `setter_id = auth.uid()`.
- Admin (`has_role(auth.uid(),'admin')`) full access.

For `ob_campaign_memberships`, `ob_conversations`, `ob_messages`: access if the parent lead is owned by the caller, or admin.

`ob_suppression_list` and `ob_webhook_events`: admin-only via `has_role`; server code uses `supabaseAdmin`.

GRANTs to `authenticated` and `service_role` on every table (no `anon`).

### 4. Timeline view

Postgres view `ob_lead_timeline` unioning, for a given `lead_id`:

```text
messages           → ts=sent_at,      kind='message',    ref=id, meta={direction, subject}
outreach_activities→ ts=occurred_at,  kind='activity',   ref=id, meta={type, detail}
call_attempts      → ts=created_at,   kind='call',       ref=id, meta={outcome, notes}
linkedin_tasks     → ts=completed_at OR due_date, kind='linkedin', meta={task_type,status}
appointments       → ts=scheduled_at, kind='appointment',meta={status, outcome_notes}
```

Ordered `ts DESC`. RLS piggybacks on the underlying tables. A thin server fn `getLeadTimeline({ leadId })` wraps it with `requireSupabaseAuth` for the client.

### 5. Smartlead integration setup (secrets only, no sync yet)

Add two secrets so the schema is ready for webhook writes:

- `SMARTLEAD_API_KEY` — user pastes from Smartlead settings.
- `SMARTLEAD_WEBHOOK_SECRET` — shared secret for verifying inbound webhooks.

Also scaffold the webhook receiver stub at `src/routes/api/public/webhooks/smartlead.ts` that:

- HMAC-verifies against `SMARTLEAD_WEBHOOK_SECRET`.
- Inserts raw payload into `ob_webhook_events` with `processed=false`.
- Returns 200. No lead/conversation upserts yet — that's the next phase.

Callback URL to paste into Smartlead: `https://project--77a6d453-2ccb-4bdc-b7a5-7900dd491db2.lovable.app/api/public/webhooks/smartlead`.

### 6. Admin leads listing (only UI in this pass)

- Route: `/app/admin/emails/leads`
- Table columns: name, company, title, email + email_status badge, phone, status, owner (setter name), lead score, updated_at.
- Server fn `listObLeads({ search, status, ownerSetterId, limit, offset })` under `requireSupabaseAuth` + admin check.
- Basic filters (status dropdown, owner dropdown, search box). No create/edit yet — this is a read-only inventory table so you can confirm the schema and RLS work before we build the setter-facing UI, sequences, and Smartlead sync.

### Not in this pass (called out so scope is clear)

- Setter-facing dashboard, inbox, sequence builder, dialer UI.
- Smartlead campaign/lead sync (create-in-Smartlead when adding to a campaign).
- Timeline rendering component.
- Unsubscribe handling + auto-suppression writes from webhook events.
- Bulk CSV import into `ob_leads`.

### Technical notes

- All migration SQL runs in a single `supabase--migration` call: enums → tables → GRANTs → ENABLE RLS → policies → view → trigger.
- No changes to existing inbound tables.
- New `setter` role added to `app_role`; `handle_new_user()` is not modified in this pass — new setters will be assigned the role manually by an admin (or say the word and I'll add an invite flow next).
