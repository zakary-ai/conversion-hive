## Goal
Fix two issues setters (Lynn) are hitting on desktop and across devices:
1. The Call button doesn't dial on desktop.
2. The time scroll-wheel in "Schedule a callback" / appointment dialogs doesn't actually scroll, so callbacks/appointments can't be booked.

## 1. Desktop calling via Quo

`CallButton` in `src/routes/app/_authenticated/leads.tsx` currently only fires the `openphone://dial?...` deep link and falls back to `tel:`. On desktop, if the Quo (OpenPhone) desktop app isn't installed, both schemes silently fail — nothing happens.

Update the success handler so that on desktop:
- Copy the lead's phone number to the clipboard.
- Fire the `openphone://dial?...` deep link (still works if the desktop app is installed).
- Open the Quo web app (`https://my.openphone.com/`) in a new tab as the universal fallback so Lynn can paste the number and dial from the browser.
- Show a toast: "Calling via Quo — number copied to clipboard."

On mobile, keep the current behavior (deep link → `tel:` fallback) so phones still launch the Quo app / native dialer.

Detect desktop with a simple `matchMedia("(pointer: fine)")` + no-touch check (or `!('ontouchstart' in window)`), which is reliable across browsers.

No backend changes — `startBridgeCall` already logs the call and returns the number.

## 2. Scroll-wheel time picker actually works

`src/components/date-time-picker.tsx` uses CSS `snap` + an `onScroll` handler that, after 120ms, smooth-scrolls the column back to the rounded index. Two real problems:

- On desktop, a mouse wheel over the column often scrolls the parent Dialog (`max-h-[90vh] overflow-y-auto` in `CallbackDialog`) instead of the column, because the wheel event isn't claimed.
- The 120ms smooth re-snap can fight a continuing wheel/drag and feel like "the picker won't move".

Changes to `DateTimePicker` / `Wheel`:
- Add `onWheel` handler on each `Wheel` column that calls `e.stopPropagation()` and manually advances `scrollTop` by `deltaY`, so desktop mouse-wheel always targets the column and never the dialog.
- Add `overscroll-contain` to the column so trackpad/touch scroll doesn't bleed into the dialog.
- Replace the post-scroll smooth re-snap with an instant snap (`behavior: "auto"`) and only run it when the user has actually stopped scrolling (debounce already exists). This stops the fight with continued input.
- Keep tap/click selection (already works) and keep arrow/keyboard not required.
- For the AM/PM column (only 2 items), ensure the spacer math still leaves both reachable — it does, but verify.

These changes apply to every place the picker is used (callback dialog, reschedule dialog, slot picker), so all setter accounts benefit.

## Verification
- Desktop: open Leads → click Call → confirm a new tab opens to my.openphone.com, toast shows, clipboard has the number, and (if Quo desktop is installed) the app pops up dialing.
- Desktop: open Schedule a callback → mouse-wheel over Hour, Minute, AM/PM columns → values change; click Schedule → callback saved (toast).
- Mobile: Call still launches Quo / dialer; touch-scroll on the picker still snaps.

## Files touched
- `src/routes/app/_authenticated/leads.tsx` — `CallButton` desktop branch (clipboard + open Quo web).
- `src/components/date-time-picker.tsx` — `onWheel` handler, overscroll-contain, snap behavior tweak.
