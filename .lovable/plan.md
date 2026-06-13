
# App Store–Ready iOS Build

This app is a server-rendered TanStack Start web app, so the cleanest path to the App Store is a **Capacitor iOS shell that loads the published Lovable URL** (`https://conversion-hive.lovable.app`) inside a native WKWebView. That way the native binary stays tiny, every server function / Zoom / email flow keeps working, and you only have to ship updates to the web — Apple just sees a native iOS app.

In parallel I'll harden the whole authenticated app for iPhone: real sticky header & bottom nav, full safe-area handling (notch + home indicator), 44pt touch targets, no horizontal scroll at 375/390/430 widths.

---

## 1 · iOS shell (Capacitor)

- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/app`.
- Create `capacitor.config.ts`:
  - `appId: "com.conversionlab.app"`
  - `appName: "Conversion Lab"`
  - `server.url: "https://conversion-hive.lovable.app"`, `server.cleartext: false`
  - `ios.contentInset: "always"`, `backgroundColor: "#0a0a14"`
  - splash + status-bar config (dark, translucent)
- Generate app icon set + splash from the existing brand mark (1024×1024 source → all iOS sizes via `@capacitor/assets`).
- Add `ios/` project, set deployment target iOS 14+, bundle id `com.conversionlab.app`, display name "Conversion Lab", portrait only (iPhone), light+dark.
- Add a build script + a README section with the exact Xcode steps (open `ios/App/App.xcworkspace`, set Team, Archive → Distribute App → App Store Connect).
- Privacy: no camera/mic/location/tracking usage strings needed — webview only.

## 2 · App Store compliance fixes (so it passes review the first time)

- **Account deletion in-app** (Apple 5.1.1(v) — hard reject if missing). Add "Delete account" in `/profile` that calls a new `deleteMyAccount` server function (deletes auth user + cascades).
- **No external payments / signup links** — verified: applications + setter invites are in-app, no Stripe.
- **Sign in with Apple** — only required if you offer other social logins. Currently email-only, so skipped (note in plan).
- **Privacy policy + Terms URLs** — add `/privacy` and `/terms` routes with real content, link from `/auth` and `/profile`. Required for App Store Connect metadata.
- **Support URL + marketing URL** — note in submission section that these need to be set in App Store Connect (uses your domain).

## 3 · iPhone UI pass (all `/_authenticated/*` screens + `/auth`, `/apply`)

Global (`__root.tsx` + `_authenticated/route.tsx`):
- Viewport meta already has `viewport-fit=cover` ✓. Lock `maximum-scale=1` only on inputs to stop iOS auto-zoom (font-size ≥ 16px on inputs).
- Header: change `sticky top-0` → keep sticky, add `pt-[env(safe-area-inset-top)]` and a solid `bg-card` (no transparency under notch).
- Bottom nav: already fixed; add `pb-[env(safe-area-inset-bottom)]` (already there) and increase tap target to 56px min ✓.
- Main `<main>`: remove the double padding-bottom, use `pb-[calc(env(safe-area-inset-bottom)+5rem)]` only on mobile.
- Add `overscroll-behavior-y: none` on body to kill rubber-band white flash.
- Add `-webkit-tap-highlight-color: transparent` globally.

Per-screen audit (sticky chrome + horizontal overflow + touch targets) on:
- `/dashboard`, `/leads`, `/calendar`, `/training`, `/training/$moduleId`, `/profile`, `/commissions`
- `/admin`, `/admin/leads`, `/admin/clients`, `/admin/clients/$userId`, `/admin/settings`, `/admin/applications`, `/admin/modules`, `/admin/quizzes`, `/admin/commissions`, `/admin/scraper`
- `/auth`, `/apply`

Fixes applied where needed: wrap raw `<table>` in horizontal scroll containers or convert to mobile card list (same pattern used in `commissions.tsx`); ensure all dialogs are full-screen on mobile via `max-h-[calc(100dvh-2rem)]` + scroll; use `dvh` not `vh` (iOS Safari address bar); `grid-cols-[minmax(0,1fr)_auto]` on header rows per the responsive-layout rule.

## 4 · PWA manifest + icons (also used by Capacitor asset generator)

- `public/manifest.webmanifest` with name, short_name "Conversion Lab", `display: "standalone"`, `theme_color: "#0a0a14"`, `background_color: "#0a0a14"`, icons 192/512/maskable.
- Apple touch icons (180×180) + favicon.
- Link tags in `__root.tsx` head.
- **No service worker** (per project policy — Capacitor doesn't need it and it would break the Lovable preview).

## 5 · Submission checklist (delivered as a `IOS_SUBMISSION.md`)

Step-by-step for first-time App Store submission: Apple Developer account, bundle id registration, App Store Connect app record, screenshots (6.7" + 6.5" required), privacy nutrition labels (data collected: email, name; not linked to tracking), age rating, description/keywords, archive & upload via Xcode, TestFlight, submit for review.

---

## Technical details

- `server.url` Capacitor mode means iOS app is a thin WKWebView pointing at production. Updates to the web ship instantly without a new App Store build — only native shell changes need resubmission. (Apple allows this as long as the app has substantive functionality, which it does.)
- Capacitor `ios/` folder is generated locally (`npx cap add ios`) — not committed by the agent since iOS builds happen on your Mac. I'll give you the exact commands to run.
- Account deletion server function uses `supabaseAdmin.auth.admin.deleteUser(userId)` guarded by `requireSupabaseAuth`.
- `dvh` units are supported on iOS 15.4+ — fallback to `vh` via `min-height: 100vh; min-height: 100dvh;`.

---

## Out of scope (ask if you want any of these)

- Push notifications (needs APNs + Firebase setup).
- Native camera/file picker (webview file input works for photos already).
- Offline mode (would require a service worker — currently disabled by project policy).
- Android / Play Store (mirror process if you want it next).

Ready to build when you approve.
