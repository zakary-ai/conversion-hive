# App Store & Play Store Submission Checklist

This project is wrapped for native distribution using **Capacitor 8**. The
native shell loads the live web app from `https://conversionlab.space` — so
web changes you publish through Lovable appear in the installed app
instantly without resubmitting a new binary. You only need a new build for:

- native plugin changes
- icon / splash / name / bundle-ID changes
- iOS or Android OS-version bumps

---

## 1. App identity (already configured)

| Field        | Value                       |
| ------------ | --------------------------- |
| App name     | `Conversion Lab`            |
| Bundle ID    | `com.conversionlab.app`     |
| Web URL      | `https://conversionlab.space` |
| Brand color  | `#0a0a14`                   |

Defined in `capacitor.config.ts`. Both iOS and Android use the same bundle ID
so the same Apple/Google developer org owns both listings.

---

## 2. One-time machine setup

You need a **macOS machine with Xcode 15+** for iOS and **Android Studio** for
Android. Lovable cannot run these CLIs for you.

```bash
# Clone the latest from Lovable, then:
bun install

# iOS — opens Xcode at the end
bun run ios:setup

# Android — opens Android Studio at the end
bun run android:setup
```

These scripts:
1. Build the web app (`dist/`)
2. Add the native iOS / Android project (`/ios`, `/android`)
3. Generate every icon + splash variant from `resources/icon.png` and
   `resources/splash.png` via `@capacitor/assets`
4. Sync the Capacitor config into the native projects
5. Open the IDE

Re-run `bun run mobile:sync` whenever you change `capacitor.config.ts`,
icons, or installed plugins.

---

## 3. Apple App Store — pre-flight (READ THIS BEFORE SUBMITTING)

### Accounts & certificates
- [ ] Paid **Apple Developer Program** membership (`$99/yr`)
- [ ] App Store Connect app record created with bundle ID `com.conversionlab.app`
- [ ] Xcode signed in with your developer account (Settings → Accounts)
- [ ] In Xcode: select the `App` target → Signing & Capabilities → set Team

### Required metadata in App Store Connect
- [ ] App name, subtitle, promotional text
- [ ] **Privacy Policy URL** (REQUIRED — see section 5)
- [ ] Support URL
- [ ] App category
- [ ] Age rating questionnaire completed
- [ ] App description (4000 chars max)
- [ ] Keywords (100 chars)
- [ ] **Screenshots** at the required sizes:
  - 6.7" iPhone (1290×2796) — required
  - 6.5" iPhone (1242×2688 or 1284×2778) — required
  - 13" iPad Pro (2064×2752) — required if iPad supported
- [ ] App icon (auto-included from build — 1024×1024 non-transparent)

### Privacy nutrition label (App Store Connect → App Privacy)
You must declare:
- [ ] Email Address (sign-in / auth) → Linked to user → "App Functionality"
- [ ] Name (if collected during sign-up) → Linked to user → "App Functionality"
- [ ] Usage Data (analytics, if any)
- [ ] Crash Data (if any)

If you collect nothing else, declare "Data Not Collected" for everything
else. Lying here is the #1 cause of rejection.

### Guideline 4.2 — Minimum Functionality (HIGH RISK FOR WEBVIEW APPS)
Apple frequently rejects apps that are "just a website in a webview" under
guideline 4.2. To pass first time:

- [ ] The app **must** require login (anonymous browsing of a public site
      fails 4.2). ✅ Conversion Lab requires auth — good.
- [ ] Include **native functionality the web alone cannot do** — currently
      the app uses `@capacitor/haptics`, `@capacitor/status-bar`,
      `@capacitor/splash-screen`, `@capacitor/keyboard`. Wire haptic
      feedback into 1–2 key actions (button taps, success toasts) before
      submitting — that satisfies 4.2 in the vast majority of cases.
- [ ] In App Store Connect → App Review Information, write a clear
      "Notes for review" explaining: this is a B2B sales-coaching platform
      for our paying customers, not a public website wrapper.
- [ ] Provide a **demo account** (email + password) in App Review
      Information. Without this, reviewers cannot get past the login
      screen and the app is auto-rejected.

### Required usage strings (only if you actually use the feature)
Capacitor adds these to `ios/App/App/Info.plist` only when the
corresponding plugin is installed. The current plugins (`app`, `haptics`,
`keyboard`, `splash-screen`, `status-bar`) don't require any usage strings —
no camera / mic / location / contacts / photos are used. Don't add unused
permissions; Apple rejects apps that request capabilities they don't use.

### Build & upload
```bash
bun run ios:sync     # rebuild + sync any web changes into the native shell
bun run ios:open     # opens Xcode
```
In Xcode:
1. Select `Any iOS Device (arm64)` as the run destination
2. Product → Archive
3. Window → Organizer → Distribute App → App Store Connect → Upload
4. In App Store Connect, select the build, submit for review

---

## 4. Google Play Store — pre-flight

### Accounts
- [ ] **Google Play Console** account (`$25` one-time)
- [ ] App created with package name `com.conversionlab.app`
- [ ] Closed testing track with at least **12 testers for 14 days**
      (required for all new personal developer accounts since 2023)

### Required listing assets
- [ ] App name (50 chars)
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] App icon — 512×512 PNG (auto-generated from `resources/icon.png`)
- [ ] Feature graphic — 1024×500 PNG
- [ ] Phone screenshots — at least 2, max 8, 1080×1920 or larger
- [ ] **Privacy Policy URL** (REQUIRED)
- [ ] Data safety form filled out
- [ ] Content rating questionnaire
- [ ] Target audience (13+ minimum for B2B)

### Build & upload
```bash
bun run android:sync
bun run android:open    # opens Android Studio
```
In Android Studio:
1. Build → Generate Signed Bundle / APK → **Android App Bundle (.aab)**
2. Create or select a keystore (back it up — losing it locks you out forever)
3. Upload the `.aab` to Play Console → Production → Create new release

---

## 5. Privacy Policy (REQUIRED for both stores)

Both stores reject apps without a publicly accessible privacy policy URL.
The policy must disclose:
- What data you collect (email, name, usage data, etc.)
- Why you collect it
- Who you share it with (Lovable Cloud / Supabase as data processor)
- How users delete their account / data
- Contact email

**Action required:** add a `/privacy` route to the app and host it at
`https://conversionlab.space/privacy`. Apple checks the URL during review —
if it 404s, automatic rejection.

The same applies to a **Terms of Service** page at `/terms` — Apple
requires it for any app with user accounts or paid features.

---

## 6. Account deletion (REQUIRED by Apple since 2022)

Any app that lets users create an account must provide a way to delete
that account from inside the app. Add a "Delete account" button in the
user's settings screen that calls an authenticated server function to
remove their auth user + related data. Without this, automatic rejection.

---

## 7. Final pre-submission smoke test

Before tapping "Submit for Review", check on a real device:

- [ ] App launches without a network error on cellular
- [ ] Splash screen shows the correct logo and hides cleanly
- [ ] Status bar text is readable (white on dark)
- [ ] Login works
- [ ] Every nav tab loads
- [ ] Logout works
- [ ] Account deletion works
- [ ] Pull-to-refresh doesn't break the web app
- [ ] iOS: rotation behaves (or lock to portrait in Xcode → General → Device Orientation)
- [ ] No "Lovable" / "Vite" / placeholder strings visible anywhere
- [ ] Privacy Policy URL loads
- [ ] No keyboard overlap on text inputs
- [ ] Back-swipe doesn't navigate the user out of the app on the home screen

---

## What's already done in this repo

- ✅ Capacitor configured for iOS + Android with `appId`, `appName`, brand colors
- ✅ Native plugins installed: app, haptics, keyboard, splash-screen, status-bar
- ✅ `resources/icon.png` (1024×1024) ready for asset generation
- ✅ `resources/splash.png` + `resources/splash-dark.png` ready
- ✅ Native shell points at the production custom domain — web updates ship instantly
- ✅ Mobile-responsive UI across all pages
- ✅ Auth-gated routes (passes Apple 4.2 minimum functionality)

## What YOU must do before submitting

1. Run `bun run ios:setup` (macOS) and/or `bun run android:setup` once
2. Create App Store Connect / Play Console listings
3. Write & host the Privacy Policy and Terms of Service pages
4. Add in-app account deletion
5. Wire haptic feedback to a few key actions
6. Create a reviewer demo account and add its credentials to App Review Information
7. Take screenshots on the required device sizes
8. Archive in Xcode → Upload, and/or build signed `.aab` in Android Studio → Upload
