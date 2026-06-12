## Goal

When a setter clicks **Call** on a lead, OpenPhone (now branded "Quo") rings the setter's personal phone first, then bridges them to the lead — all initiated from our app. Each client account is auto-provisioned an OpenPhone phone number on signup.

## Heads-up before we build

OpenPhone's public API today exposes contacts, messages, call logs, and webhooks well, but **programmatic outbound call initiation (click-to-dial / bridge calling) is gated** — it's available on their Business/API plan and the endpoint is `POST /v1/calls`. If your OpenPhone workspace doesn't have API call-initiation enabled, the bridge will fail and we'd need to fall back to opening their dialer. I'll build assuming it's enabled and surface a clear error if not.

Also: OpenPhone does not currently expose a public "buy a number" endpoint. **Auto-provision on signup will reserve a number from a pre-purchased pool** that you (admin) top up in the OpenPhone dashboard. If the pool runs dry, signup falls back to "admin assigns later."

## What gets built

### 1. Secrets & connection
- Add `OPENPHONE_API_KEY` (server secret) — you'll paste this from OpenPhone Settings → API.
- Add `OPENPHONE_WEBHOOK_SECRET` for verifying inbound webhooks.

### 2. Database changes (one migration)
- `profiles`: add `openphone_user_id text`, `openphone_number_e164 text`, `openphone_number_id text`, `personal_phone_e164 text` (the setter's real cell — needed for bridge leg 1).
- New table `openphone_number_pool` (admin-managed): `id`, `phone_e164`, `openphone_number_id`, `assigned_user_id` (nullable), `assigned_at`. RLS: admin-only.
- New table `call_logs`: `id`, `lead_id`, `user_id`, `openphone_call_id`, `direction`, `status`, `duration_sec`, `recording_url`, `started_at`, `ended_at`. RLS: setter sees own, admin sees all.

### 3. Server functions (`src/lib/api/calls.functions.ts`)
- `provisionNumberForUser({ user_id })` — admin-only. Pulls next free row from `openphone_number_pool`, invites/creates the OpenPhone user via API, assigns the number, writes IDs back to `profiles`.
- `setPersonalPhone({ phone })` — setter sets their cell on the profile page (this is the phone OpenPhone rings first).
- `startBridgeCall({ lead_id })` — looks up lead phone + setter's OpenPhone number + personal phone, calls `POST https://api.openphone.com/v1/calls` with `from = setter's OP number`, `to = lead`, `userId = setter's OP user`, `participants = [personal cell]` so leg 1 rings the cell. Inserts a row in `call_logs` and updates the lead's `last_contacted_at`.
- `listMyCalls({ lead_id? })` — for the lead detail timeline.

### 4. Webhook (`src/routes/api/public/hooks/openphone.ts`)
- Verifies `openphone-signature` HMAC against `OPENPHONE_WEBHOOK_SECRET`.
- Handles `call.completed`, `call.recording.completed` → updates `call_logs` with duration, status, recording URL.

### 5. UI
- **Lead row / lead detail**: replace the existing phone link with a **Call** button (phone icon). Click → `startBridgeCall` → toast "Ringing your phone…". Disabled if setter has no `personal_phone_e164` set (with inline "Add your phone in Profile" link).
- **Profile page**: add "Your cell phone (for bridge calling)" field — this is editable (name stays locked, per your earlier rule).
- **Admin → Setter detail**: show assigned OpenPhone number; "Provision number" button if none; recent call log with duration + recording playback.
- **Admin → Settings (new section "Phone numbers")**: paste-in form to add numbers to the pool (E.164 + OpenPhone number ID from their dashboard), table of pool status (assigned vs free).

### 6. Hook signup to auto-provision
- In `handle_new_user` flow (or a follow-up server fn called from the auth success handler), call `provisionNumberForUser` for the new client. If pool is empty, log a warning and continue — admin can assign later from the setter detail page.

## Open questions before I start

1. **Do you have the OpenPhone API key + a Business plan that allows call initiation?** If not, I can build everything except `startBridgeCall` and stub it with a clear "API call-init not enabled" error until you upgrade.
2. **Number pool vs single shared number** — confirm you want one dedicated number per client (recommended for caller-ID consistency) vs everyone calling from one shared OpenPhone number.
3. **Recordings** — okay to store the OpenPhone-hosted recording URL on `call_logs` and play inline? (We don't re-host the audio.)

Reply with answers to those three and I'll implement.