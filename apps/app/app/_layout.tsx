import "../global.css";

import { useEffect } from "react";
import { Platform } from "react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "@/providers/AppProviders";
import { FONT_SOURCES } from "@/services/fonts/fonts";

if (Platform.OS !== "web") void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_SOURCES);
  const ready = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (ready && Platform.OS !== "web") void SplashScreen.hideAsync();
  }, [ready]);
  // Web renders immediately (SSR/SEO); fonts swap in. Native waits behind the splash screen.
  if (!ready && Platform.OS !== "web") return null;
  return (
    <AppProviders>
      {/* Public surfaces are light-only (X18). */}
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
}
