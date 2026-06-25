import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Conversion Lab is an SSR (TanStack Start) app, so the native shell loads
 * the published web app over HTTPS rather than a bundled static build.
 * `allowNavigation` keeps in-app navigations inside the WebView (no Safari
 * bounce) and includes Supabase + the Lovable preview/published hosts so
 * auth and API calls work.
 */
const config: CapacitorConfig = {
  appId: "com.conversionlab.app",
  appName: "Conversion Lab",
  webDir: "dist",
  server: {
    url: "https://conversionlab.space",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    allowNavigation: [
      "conversionlab.space",
      "*.conversionlab.space",
      "*.lovable.app",
      "*.supabase.co",
      "accounts.google.com",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0a0a14",
    limitsNavigationsToAppBoundDomains: false,
    scheme: "Conversion Lab",
  },
  android: {
    backgroundColor: "#0a0a14",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0a0a14",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a14",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
