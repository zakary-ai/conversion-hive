import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the built web app (dist/) in a native iOS/Android WebView.
 * We intentionally do NOT set `server.url` — Apple rejects apps that just
 * load a remote website (Guideline 2.1/4.2), and an external server URL
 * also causes navigations to bounce out to Safari. The app must run from
 * the bundled `webDir` so it works offline and behaves like a native app.
 */
const config: CapacitorConfig = {
  appId: "com.conversionlab.app",
  appName: "Conversion Lab",
  webDir: "dist",
  ios: {
    contentInset: "never",
    backgroundColor: "#0a0a14",
    limitsNavigationsToAppBoundDomains: true,
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
