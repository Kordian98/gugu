import type { ConfigContext, ExpoConfig } from "expo/config";

// Shell config (topic 01). Build variants, bundle IDs per APP_VARIANT, EAS and
// universal/app links are owned by platform-devops (topic 13, R6/R12).
type Variant = "development" | "staging" | "production";

const variant = (process.env["APP_VARIANT"] ?? "development") as Variant;

const ids: Record<Variant, { id: string; name: string }> = {
  development: { id: "vn.gugu.app.dev", name: "GuGu Dev" },
  staging: { id: "vn.gugu.app.staging", name: "GuGu Staging" },
  production: { id: "vn.gugu.app", name: "GuGu" },
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: ids[variant].name,
  slug: "gugu",
  version: "0.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "gugu",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: ids[variant].id,
    icon: "./assets/expo.icon",
    supportsTablet: true,
  },
  android: {
    package: ids[variant].id,
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
  },
  web: {
    // X8 / ADR-0006: web output mode is decided by spike S1 (topic 10). SDK 58 default is "server".
    output: "server",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      { backgroundColor: "#FFFFFF", image: "./assets/images/splash-icon.png", imageWidth: 76 },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
