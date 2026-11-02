import { Platform } from "react-native";

const KEY = "gugu.crm.demo";

/**
 * Demo seed switch, development builds only: `?demo=1` on web (remembered for the tab, `?demo=0` clears)
 * or EXPO_PUBLIC_CRM_DEMO=1 on native. Production never shows demo numbers.
 */
export function useDemoMode(): boolean {
  if (!__DEV__) return false;
  if (Platform.OS !== "web") return process.env["EXPO_PUBLIC_CRM_DEMO"] === "1";
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") sessionStorage.setItem(KEY, "1");
    if (q === "0") sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  }
}
