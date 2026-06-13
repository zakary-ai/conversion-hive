# Submitting Conversion Lab to the iOS App Store

This app uses **Capacitor** to wrap the published web app
(`https://conversion-hive.lovable.app`) in a native iOS WKWebView shell.
The native binary is tiny; all features run from your live web app, so web
changes deploy instantly without an App Store update.

You only need to resubmit a new build when:
- You change `capacitor.config.ts`
- You add/remove a native plugin
- You change the app icon, name, splash, or version number
- Apple requires a recompile against a new iOS SDK

---

## One-time setup (on a Mac)

You need: macOS, Xcode 15+, an Apple Developer account ($99/yr), CocoaPods.

```bash
# from the project root
bun install              # ensure capacitor deps are installed
bun run build            # build the web bundle (creates dist/)
npx cap add ios          # creates the ios/ folder (one time only)
npx cap sync ios         # copy web + plugins into the iOS project
npx cap open ios         # opens Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities**.
2. Pick your **Team** (your Apple Developer account).
3. Bundle Identifier is already `com.conversionlab.app`.
4. Set **Deployment Info → iPhone Orientation** = Portrait only.
5. Set the **Display Name** to `Conversion Lab`.
6. **Version** = `1.0.0`, **Build** = `1`.

### App icon
Replace `ios/App/App/Assets.xcassets/AppIcon.appiconset/` icons with the ones
generated from `src/assets/app-icon-1024.png`. Easiest path:

```bash
bun add -D @capacitor/assets
npx capacitor-assets generate --ios --iconSource src/assets/app-icon-1024.png
```

That command creates every required iOS icon + splash size automatically.

---

## App Store Connect setup

Create the app record at https://appstoreconnect.apple.com:

| Field | Value |
| --- | --- |
| Name | Conversion Lab |
| Bundle ID | com.conversionlab.app |
| SKU | conversion-lab-ios |
| Primary language | English (U.S.) |
| Category | Business (secondary: Productivity) |
| Price | Free |

### Required metadata
- **Privacy Policy URL** → `https://conversion-hive.lovable.app/privacy`
- **Terms of Use URL** → `https://conversion-hive.lovable.app/terms`
- **Support URL** → your support email/page (required)
- **Marketing URL** (optional)
- **Description** (≥10 chars) — short pitch of the platform
- **Keywords** — comma-separated, ≤100 chars total
- **Screenshots** — 6.7" iPhone (1290×2796) **required**; 6.5" iPhone optional
  Capture 3–5 screens via the iOS Simulator (iPhone 15 Pro Max).

### App Privacy ("Nutrition Label")
Data the app collects:
- **Contact Info → Name, Email Address** — Linked to user, used for app functionality
- **User Content → Other user content (CRM notes, leads)** — Linked to user, used for app functionality
- **Identifiers → User ID** — Linked to user, used for app functionality
- Not used for tracking. No third-party advertising SDKs.

### Age rating
4+ (no objectionable content).

### Sign-In Information (for the App Review team)
Provide a demo admin login so reviewers can see the full app:
```
Email: review-demo@conversionlab.company
Password: <create a temp account before submitting>
```

---

## Build & upload

In Xcode:
1. Select destination = **Any iOS Device (arm64)**.
2. **Product → Archive**.
3. When the Organizer opens → **Distribute App** → **App Store Connect** → **Upload**.
4. After upload, the build appears in App Store Connect under
   **TestFlight** in ~10–30 minutes (you'll get an email when it's ready).
5. In the version page, attach the build, fill in "What's New", and click
   **Add for Review** → **Submit to App Review**.

Review usually takes 24–48 hours.

---

## Compliance checklist (already done in code)

- ✅ Bundle ID `com.conversionlab.app`
- ✅ In-app **account deletion** (`/profile → Delete account`) — Apple 5.1.1(v)
- ✅ `/privacy` and `/terms` routes live on the production site
- ✅ Web manifest + apple-touch-icon
- ✅ Safe-area handling for notch + home indicator
- ✅ No external sign-up links (Apple 3.1.3)
- ✅ Single sign-in method (email) — Sign in with Apple not required

---

## Updating later

After web-only changes: nothing to do. The native app loads them automatically.

After native shell changes:
```bash
bun run build
npx cap sync ios
# bump version + build in Xcode, then Archive → Distribute
```
