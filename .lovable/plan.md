
## B2B Setter Overhaul — Lead Pool + Claim + Outcomes

Big changes to how B2B setters work leads. Existing `leads` rows get archived; a new shared pool table drives everything from here on.

### 1. Archive existing leads

- Add `archived boolean default false` to `leads` (if not already effectively supported via `retired`) and flip every existing row to archived. All current setter/admin lead views filter `archived = false`, so they disappear from the UI entirely (admin can still see them via a hidden query if needed later).

### 2. New shared lead pool

New table `b2b_lead_pool` — this is the "spreadsheet" every setter picks from:

```text
id, first_name, last_name, company, website, email, phone,
linkedin_url, title, notes, source, imported_at, imported_by (admin uid),
claimed_by (uuid null), claimed_at (timestamptz null),
status enum: 'unclaimed' | 'claimed' | 'burned' | 'booked',
archived boolean default false, created_at, updated_at
```

- Unique index on lower(email) where email is not null (dedupe on CSV re-import).
- RLS:
  - Admins full access.
  - `b2b_setter` can SELECT unclaimed rows AND their own claimed rows.
  - `b2b_setter` can UPDATE only to claim (`claimed_by = auth.uid()` when currently null) or update their own claimed rows.
- Admin CSV import route (reuse existing CSV importer pattern from `/app/admin/leads`) writes into this table with phone/email dedupe.

### 3. Claim flow

- New route `/app/b2b-setter/pool` (setter side) — paginated table of unclaimed leads with search + a "Claim" button per row.
- Claim = server fn `claimPoolLead({ id })` that atomically sets `claimed_by = auth.uid(), claimed_at = now(), status = 'claimed'` only if still unclaimed (WHERE claimed_by IS NULL). Returns 409 if someone beat them.
- Once claimed, the lead appears on the setter's own leads list at `/app/b2b-setter/leads` (new).

### 4. Setter lead detail + Log Call Outcome

- New route `/app/b2b-setter/leads/$id` showing all fields (first/last, company, website, email, LinkedIn, title, phone, notes).
- Button **Log call outcome** opens a dialog with 4 options:

  1. **Book** — opens a dialog embedding the provided GoHighLevel iframe:
     `https://api.leadconnectorhq.com/widget/booking/JG2Vhe5FptIczfb90H1x`
     (with the `form_embed.js` script loaded once via a small wrapper). On close, prompt "Did the booking go through?" → if yes set status='booked' and mark pool row `status='booked'`.
  2. **Schedule callback** — date/time picker + optional note. Creates a `b2b_callbacks` row (see below). Setter's calendar shows it; admins also see all setters' callbacks.
  3. **Didn't pick up** — logs an attempt row and flags the lead as `didnt_pick_up = true, last_attempt_at = now()`. Lead moves into the setter's "Didn't Pick Up" queue.
  4. **Not interested / Burn lead** — sets pool status='burned', hides from setter's active lists; row stays for admin audit.

- Every outcome writes to a new `b2b_call_attempts` table (`id, pool_lead_id, setter_id, outcome, note, occurred_at`) so history is visible on the lead detail page.

### 5. Callbacks table + calendar integration

New `b2b_callbacks`:

```text
id, pool_lead_id, setter_id, scheduled_at, note, status enum:'scheduled'|'completed'|'missed',
created_at, updated_at
```

- Setter calendar (`/app/b2b-setter/calendar`, new) shows their scheduled callbacks with the lead name + click-through to lead detail.
- Admin calendar (extend existing admin B2B calendar panel) gets a new "Callbacks" layer showing all setters' callbacks with the owning setter's name.

### 6. Didn't Pick Up section

- New route `/app/b2b-setter/didnt-pick-up` — list of the setter's claimed leads where the latest attempt outcome is `didnt_pick_up` and status is still `claimed`. Sorted by last_attempt_at desc so oldest untouched surfaces first. Same lead detail / Log outcome flow as the main lead list.

### 7. Sidebar changes for B2B setter role

Replace current B2B setter nav (`Leads`, `Email`, `Calendar`, `Training`, `Commissions`, `Support`, `Profile`) with:

```text
Dashboard, Lead Pool, My Leads, Didn't Pick Up, Callbacks (Calendar), Inbox (existing outbound), Training, Commissions, Support, Profile
```

### 8. Admin side additions

- New admin route `/app/admin/b2b/pool` — full view of the pool (all statuses), plus CSV import button (multi-file, phone/email dedupe, same UX as the existing admin leads importer).
- Existing `Outbound Leads` sidebar entry stays (email/ob_ tables are unchanged). Add "Lead Pool" as a new entry.

### Out of scope this pass

- No changes to the outbound (`ob_*`) email tables or inbox — separate system.
- No auto-dialer integration for Didn't Pick Up; it's just a queue view.
- No SMS/email follow-up automation from callbacks.
- No commission changes.

### Technical notes

- All schema in one migration: alter `leads`, create `b2b_lead_pool`, `b2b_callbacks`, `b2b_call_attempts`, GRANTs, RLS, policies, update triggers.
- Archive of existing `leads` runs as a data update (insert tool) after the migration.
- Server fns in `src/lib/api/b2b-pool.functions.ts` (`listPoolUnclaimed`, `claimPoolLead`, `listMyClaimedLeads`, `getPoolLead`, `listDidntPickUp`, `listMyCallbacks`, `listAllCallbacksAdmin`, `logCallOutcome`, `importPoolCsv`).
- Booking iframe rendered inside a shadcn Dialog with a mounted-once script tag; height ~700px, scrollable.
- Claim is a single UPDATE with `WHERE id = $1 AND claimed_by IS NULL RETURNING *` — race-safe without a separate lock.
