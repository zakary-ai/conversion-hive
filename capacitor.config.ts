import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the published web app in a native iOS/Android WebView.
 * Production web changes ship instantly — only changes to native config
 * or installed plugins require a new App Store / Play Store build.
 */
const config: CapacitorConfig = {
  appId: "com.conversionlab.app",
  appName: "Conversion Lab",
  webDir: "dist",
  server: {
    // Point the native shell at the production custom domain.
    url: "https://conversionlab.space",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
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
