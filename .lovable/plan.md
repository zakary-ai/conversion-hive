# App Store submission prep

## What I found that would fail (or risk failing) review today

1. **Wrong production URL shipped in the native shell.** `capacitor.config.ts`, `ios/App/App/capacitor.config.json`, and `IOS_SUBMISSION.md` all still point at `https://conversion-hive.lovable.app`. The actual published URL is `https://conversion-labb.lovable.app` (custom domain `conversionlab.space`). If we submit as-is the reviewer opens a stale build (or a 404). This is the single biggest reject-on-launch risk.
2. **Mobile layout overflow on `/app/admin/closers`** (your screenshot). The row uses `flex-wrap` but the inner button cluster is one nested flex that doesn't wrap, so "Resend invite" and the trash icon get clipped under the edge / bottom nav. Same pattern likely on other admin list rows.
3. **Info.plist orientation includes landscape on iPhone**, but the submission doc and our UI are portrait-only. Apple reviewers test rotation; landscape that breaks layout = rejection under Guideline 4.0.
4. **Capacitor `server.url` points at a remote URL** — Apple has rejected apps that are "just a webview of a website" under 4.2 (Minimum Functionality). Mitigation: keep native chrome (icon, splash, status bar, safe area) polished and ensure the domain is app-aligned, plus document why the experience is more than a website (auth-gated CRM, push-style notifications, role-based dashboards, in-app account deletion).
5. **No demo reviewer account guarantee.** The submission doc names `review-demo@conversionlab.company` but there's no script/seed to ensure that account exists with admin role + sample data. Reviewers reject 5.1.1 if they can't sign in.
6. **Missing iOS native polish:** orientation lock, status-bar style, splash background, NSAppTransportSecurity entry, and `apple-touch-icon` / theme-color in `index.html` head should all be checked.

## Changes I will make

### 1. Domain + native config (the unblocker)

- `capacitor.config.ts`: set `server.url` to `https://conversionlab.space` (custom domain — most professional surface for review) with `cleartext: false`.
- `ios/App/App/capacitor.config.json`: same URL.
- `IOS_SUBMISSION.md`: replace every `conversion-hive.lovable.app` with `conversionlab.space`; update Privacy/Terms/Support URLs accordingly.
- `ios/App/App/Info.plist`:
  - Restrict iPhone orientations to portrait only (`UIInterfaceOrientationPortrait`).
  - Remove the legacy `armv7` `UIRequiredDeviceCapabilities` (it should be `arm64` for modern devices, or omitted).
  - Add `ITSAppUsesNonExemptEncryption = false` (skips export-compliance question on every upload).
  - Add `NSAppTransportSecurity` with `NSAllowsArbitraryLoads = false` (explicit HTTPS-only declaration).

### 2. Mobile layout fixes (the visible polish)

- `src/routes/app/_authenticated/admin/closers.tsx`: rebuild the row so on mobile it stacks (`flex-col` with full-width button group that wraps), and on `sm+` it's the current horizontal layout. Make the button cluster `flex-wrap gap-2` and let "Resend invite" collapse to an icon-only on `< sm`.
- Audit and repair the same pattern on the other admin list pages that render multi-button rows: `bookings.tsx`, `applications.tsx`, `clients.index.tsx`, `commissions.tsx`, `b2c-commissions.tsx`, `closer/calendar.tsx`. Anywhere a row uses `justify-between` + un-wrapped action cluster, switch to a wrapping cluster and ensure no horizontal scroll.
- Verify the main scroll area's bottom padding clears the bottom nav on every device (already `pb-[calc(env(safe-area-inset-bottom)+6rem)]` — keep, but confirm pages don't add their own conflicting padding).
- Add a global `overflow-x: hidden` guard on `<html>`/`<body>` so any future overflow doesn't show a horizontal scrollbar in the App Store screenshots.

### 3. Native icon + splash

- Run `npx capacitor-assets generate --ios --iconSource src/assets/app-icon-1024.png` (documented as a one-shot in IOS_SUBMISSION.md). I'll add a pre-flight check that the icon is opaque and 1024×1024 with no alpha — Apple rejects icons with transparency (Guideline 2.3.7).
- Update `LaunchScreen.storyboard` background color to match `#0a0a14` so the splash doesn't flash white during launch.

### 4. Web-side App Store readiness

- `src/routes/__root.tsx` head: confirm `<meta name="theme-color">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, and a sane `<title>` / OG metadata that match "Conversion Lab" (not "conversion-hive").
- `public/manifest.webmanifest`: align `name`, `short_name`, `theme_color`, `background_color`, `start_url`, and icon refs.
- Confirm `/privacy`, `/terms`, `/support`, and `/app/profile → Delete account` all resolve from a logged-out reviewer flow without a 500. (Public route loaders must not call `requireSupabaseAuth`.)

### 5. Reviewer demo account

- Add a one-shot SQL migration that idempotently provisions:
  - `review-demo@conversionlab.company` auth user (random known password, stored only in `IOS_SUBMISSION.md`),
  - `admin` role grant in `user_roles`,
  - a couple of seeded sample applications/bookings so the dashboard isn't empty for the reviewer.
- Document the credentials in IOS_SUBMISSION.md under "Sign-In Information."

### 6. Submission checklist (the doc the human follows in Xcode)

I'll rewrite `IOS_SUBMISSION.md` as a numbered, copy-pasteable checklist with:
- Pre-flight build commands (`bun run build && npx cap sync ios`).
- Xcode signing + version/build bump steps.
- Required App Store Connect metadata with exact strings (name, subtitle ≤30 chars, promotional text, description, keywords ≤100 chars, support URL, marketing URL, privacy URL).
- App Privacy "Nutrition Label" mapping to what the app actually collects (email, name, user content) — explicitly mark "Not used for tracking."
- Age rating answers (4+).
- Demo account credentials block.
- Screenshot capture recipe (iPhone 15 Pro Max simulator, 6.7" required size 1290×2796, exact 5 screens to capture).
- Common rejection traps and how this app already handles them (account deletion in-app, no external sign-up links, HTTPS only, portrait-locked, no third-party tracking SDKs).

## Out of scope for this turn

- Adding Sign in with Apple. Not required because we're email-only with no other third-party social login (Apple 4.8 only triggers when another social login is offered).
- Switching from Capacitor remote-URL to a fully bundled offline build. We can do that later; for now, native polish + custom domain is what de-risks 4.2.
- Building Android. iOS only.

## Technical notes (for the engineer)

- `server.url` swap: dev preview unaffected (Vite still serves locally); only the native shell reads this.
- The closers row refactor uses Tailwind only — no new components.
- Info.plist edits are safe to make directly; `npx cap sync ios` will not overwrite them.
- The reviewer demo migration must `INSERT … ON CONFLICT DO NOTHING` so re-running is a no-op.
- Icon asset regeneration is a manual step on the Mac (sandbox can't run `capacitor-assets`); the doc will spell it out.

After approval I'll execute the changes in roughly this order: domain swap → Info.plist → mobile layout fixes → web head/manifest → reviewer seed migration → IOS_SUBMISSION.md rewrite.
