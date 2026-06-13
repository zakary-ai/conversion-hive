import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the published web app in a native iOS WKWebView.
 * Production web changes ship instantly — only changes to native config
 * or installed plugins require a new App Store build.
 */
const config: CapacitorConfig = {
  appId: "com.conversionlab.app",
  appName: "Conversion Lab",
  webDir: "dist",
  server: {
    // Point the native shell at the published Lovable URL.
    url: "https://conversion-hive.lovable.app",
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
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0a0a14",
      showSpinner: false,
      iosSpinnerStyle: "small",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a14",
      overlaysWebView: false,
    },
  },
};

export default config;
