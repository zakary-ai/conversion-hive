# JustCall Power Dialer for B2B Setters

Goal: setters dial through JustCall's Sales Dialer (browser) instead of Quo, and the moment a lead picks up, our app instantly shows that lead's full card — name, company, phone, email, notes, past attempts, script, and outcome buttons.

## How the "no delay" screen pop works

JustCall fires a webhook the instant a call moves to ringing/answered. We receive it, resolve the phone number to the setter's pool lead, and push it straight to that setter's open browser tab over a live socket. No polling, so the card appears essentially as fast as the audio connects.

```text
JustCall dialer (browser)  ──call answered──▶  JustCall webhook
                                                     │  (<1s)
                                        /api/public/hooks/justcall
                                                     │  writes live_call row
                                          Realtime broadcast to that setter
                                                     │
                                    Setter's "Dialer" screen pops lead card
```

The card renders from data we already have in `b2b_lead_pool`, so nothing needs to be fetched after the pop — we match on the last 10 digits of the phone number.

## What gets built

**1. Dialer session screen** (`/app/b2b/dialer`)
- Left: the JustCall dialer embedded (or a "open dialer" button if embedding is restricted by their plan) plus session controls.
- Right: the live lead card. Idle state shows "Waiting for connect…", then flips to the lead the instant they answer.
- Card shows name, title, company, phone, email, city/state, industry, notes, prior call attempts, and the call script.
- Inline outcome buttons: Booked (opens the existing booking flow), Not interested, Callback (date/time), No answer, Info emailed — all writing through the existing `logCallOutcome` path, plus editable email/notes right on the card so they can capture the email while talking.
- Unknown number → card shows the raw number with a "create + claim lead" shortcut.

**2. Pushing leads into the dialer** (both modes, as requested)
- Auto-push: when a setter claims pool leads, those leads sync into that setter's JustCall dialer campaign.
- Manual: "Push to dialer" button on the B2B leads/pool views sends the current filtered list on demand.
- Dedupe so a lead is never queued twice, and skip do-not-contact/booked/burned leads.

**3. Call logging replaces Quo for B2B setters**
- JustCall webhooks write into `call_logs` (dial count, duration, recording, transcript when available), keyed by a new JustCall call id.
- Quo/OpenPhone stays in place only as read-only history; the B2B "Call" button switches to JustCall.

**4. Admin setup screen**
- Map each setter to their JustCall agent/number so attribution is automatic.
- Shows webhook URL to paste into JustCall and connection health.

## Technical notes

- New table `b2b_live_calls` (setter user_id, pool_lead_id, justcall_call_id, phone, state, started_at) with RLS so a setter only reads their own rows; Realtime enabled on it. This is the transport for the screen pop and also the audit trail.
- New route `src/routes/api/public/hooks/justcall.ts` verifying JustCall's signature against a `JUSTCALL_WEBHOOK_SECRET`, handling `call.ringing` / `call.answered` / `call.completed`, and writing the live-call row plus `call_logs`.
- New `src/lib/api/justcall.functions.ts` + `justcall.server.ts` for campaign create/sync/push, using `JUSTCALL_API_KEY` and `JUSTCALL_API_SECRET`.
- `call_logs` gains `justcall_call_id`; `profiles` gains a JustCall agent id/number mapping.
- Frontend subscribes once via `supabase.channel(...)` inside `useEffect`, torn down on unmount.

## What I need from you

- A JustCall API key + secret (Settings → Developers) and a webhook signing secret — I'll request these securely when we start.
- Confirmation that your JustCall plan includes Sales Dialer + API access (it's on Team/Pro plans and above); if the API tier isn't included, the fallback is click-to-call with the same pop behaviour, minus auto-queued campaigns.

## Rollout order

1. Secrets + webhook endpoint + `b2b_live_calls` table (verify a real answered call pops within a second).
2. Dialer screen with live card and outcome logging.
3. Campaign push (auto on claim + manual button).
4. Admin mapping screen, then switch the B2B Call buttons over from Quo.
