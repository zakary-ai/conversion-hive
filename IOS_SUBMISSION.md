# Submitting Conversion Lab to the iOS App Store

This app uses **Capacitor** to wrap the published web app
(`https://conversionlab.space`) in a native iOS WKWebView shell.
Web changes deploy instantly without an App Store update; you only resubmit
when the native shell, icon, splash, version, or capabilities change.

> **First-pass review checklist** — every item below is what an Apple
> reviewer most often rejects on. Tick each one before you click *Submit
> for Review*.

---

## 0. Pre-flight (already done in code)

- ✅ Bundle ID `com.conversionlab.app`
- ✅ Native shell points at production custom domain `https://conversionlab.space`
- ✅ Portrait-only on iPhone (`Info.plist`)
- ✅ HTTPS-only (`NSAllowsArbitraryLoads = false`)
- ✅ Export-compliance auto-answered (`ITSAppUsesNonExemptEncryption = false`)
- ✅ Splash background matches app theme (`#0a0a14`)
- ✅ In-app account deletion at `/app/profile → Delete account` (Apple 5.1.1(v))
- ✅ Public `/privacy`, `/terms` routes
- ✅ Web `apple-touch-icon`, theme-color, manifest
- ✅ Safe-area + notch handled in CSS
- ✅ No external sign-up links (Apple 3.1.3)
- ✅ No third-party tracking SDKs
- ✅ Email-only auth → Sign in with Apple not required (Apple 4.8 only triggers when other social sign-ins are offered)

---

## 1. One-time setup (on a Mac)

Required: macOS, Xcode 15+, an Apple Developer account ($99/yr), CocoaPods.

```bash
# from the project root
bun install
bun run build
npx cap add ios          # creates the ios/ folder (one time only — already committed here)
npx cap sync ios         # copy web + plugins into the iOS project
npx cap open ios         # opens Xcode
```

### App icon (must be opaque, 1024×1024, no alpha)

Apple rejects icons with transparency (Guideline 2.3.7). The source is
`src/assets/app-icon-1024.png`.

```bash
bun add -D @capacitor/assets
npx capacitor-assets generate --ios --iconSource src/assets/app-icon-1024.png
```

That generates every required iOS icon + splash size.

---

## 2. Xcode signing & build settings

In Xcode → **App** target → **Signing & Capabilities**:

| Field | Value |
| --- | --- |
| Team | Your Apple Developer account |
| Bundle Identifier | `com.conversionlab.app` |
| Display Name | `Conversion Lab` |
| Version | `1.0.0` |
| Build | `1` (bump on every upload) |
| Deployment Target | iOS 14.0+ |
| iPhone Orientation | Portrait only (already enforced via Info.plist) |

---

## 3. App Store Connect — create the app record

https://appstoreconnect.apple.com → My Apps → **+**

| Field | Value |
| --- | --- |
| Platform | iOS |
| Name | Conversion Lab |
| Primary language | English (U.S.) |
| Bundle ID | com.conversionlab.app |
| SKU | conversion-lab-ios |
| User Access | Full Access |

### Pricing & Availability
- Price: **Free**
- Availability: All territories

### App Information
- Category — Primary: **Business**, Secondary: **Productivity**
- Content rights: ✓ Does not use third-party content
- Age rating: **4+** (no objectionable content)

### App Privacy ("Nutrition Label")

Click **Get Started** → answer the questionnaire as follows:

| Data Type | Collected? | Linked to user? | Used for tracking? | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info → Name | Yes | Yes | No | App functionality |
| Contact Info → Email Address | Yes | Yes | No | App functionality, Account management |
| Identifiers → User ID | Yes | Yes | No | App functionality |
| User Content → Customer Support / CRM data (leads, notes) | Yes | Yes | No | App functionality |

Everything else: **Not Collected**. **Not used for tracking** for every row.

---

## 4. Version metadata (per build)

| Field | Value |
| --- | --- |
| Promotional Text (≤170 chars) | "The CRM and training platform for high-performing sales teams. Track leads, schedule interviews, and grow conversions." |
| Description (≥10 chars) | A 2–3 paragraph pitch describing lead management, interview scheduling, training, and admin/closer/setter workflows. |
| Keywords (≤100 chars total, comma-separated) | `crm,sales,leads,training,coaching,interview,booking,calendar,team,pipeline` |
| Support URL | `https://conversionlab.space/support` (or your support email page) |
| Marketing URL (optional) | `https://conversionlab.space` |
| Privacy Policy URL | `https://conversionlab.space/privacy` |
| Copyright | `2026 Conversion Lab` |

### Screenshots — REQUIRED

- **6.7" iPhone (1290×2796)** — required, 3–5 screens
- **6.5" iPhone (1242×2688)** — optional but recommended
- **iPad** — only if shipping for iPad (we are iPhone-only; skip)

Capture from the iOS Simulator (iPhone 15 Pro Max) with `Cmd+S`. Suggested 5 screens:
1. Sign in / landing
2. Admin dashboard
3. Bookings or Leads list
4. Closers / team management
5. Training or Calendar view

> Take screenshots after the design audit (admin pages now responsive,
> no horizontal overflow). Apple reviewers compare screenshots to the
> live app — make sure they match.

---

## 5. Sign-In Information (App Review team)

Reviewers WILL reject under 5.1.1 if they can't sign in.

Before submitting, manually create a demo account and verify it works
end-to-end (sign in, view dashboard, navigate every tab):

```
Email:    review-demo@conversionlab.company
Password: <create a strong temp password before submission>
Role:     Admin (so reviewer can see all tabs)
```

Paste these credentials into App Store Connect → Version → **App Review
Information → Sign-in required → Yes**.

In **Notes**, add:
> Conversion Lab is a B2B/B2C sales operations platform for sales teams.
> The provided demo account has admin access so you can review every
> screen (Bookings, Leads, Closers, Commissions, Training). Account
> deletion is available at Profile → Delete account.

---

## 6. Build & upload

In Xcode:
1. Destination = **Any iOS Device (arm64)**
2. **Product → Archive**
3. Organizer opens → **Distribute App** → **App Store Connect** → **Upload**
4. Build appears under **TestFlight** in 10–30 min (email when ready)
5. In the version page → **Build** → attach the new build
6. Fill **What's New** → **Add for Review** → **Submit to App Review**

Review usually takes 24–48 hours.

---

## 7. Common rejection traps (and how this app handles them)

| Rejection reason | How we avoid it |
| --- | --- |
| 4.2 Minimum Functionality ("just a website") | Native app shell with proper icon, splash, status bar, safe-area; auth-gated CRM with role-based dashboards — not public marketing pages |
| 5.1.1(v) Account Deletion | `/app/profile → Delete account` deletes the user via server-side admin API |
| 5.1.1 Reviewer can't sign in | Demo admin credentials provided in App Review Information |
| 2.1 App Completeness | Test the demo account on a real device before submission |
| 2.3.7 Icon with transparency | Source icon is opaque PNG; capacitor-assets exports opaque ios variants |
| 3.1.3 External payment / sign-up links | None present |
| 4.0 Design — broken rotation | Portrait-locked on iPhone in Info.plist |
| 4.8 Login Services | Email-only auth, no other social sign-ins → Sign in with Apple not required |

---

## 8. Updating later

**Web-only change** → just publish the web app. Native app loads it automatically.

**Native shell change**:

```bash
bun run build
npx cap sync ios
# Bump Build (and Version if user-facing) in Xcode → Archive → Distribute
```
