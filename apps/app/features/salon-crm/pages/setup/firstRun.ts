import { Platform } from "react-native";

const key = (salonId: string) => `gugu.crm.setupDismissed.${salonId}`;
const memory = new Set<string>();

/** "Set up later" in the first-run stepper, remembered per device (and per session as a fallback). */
export function dismissSetup(salonId: string): void {
  memory.add(salonId);
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined")
      localStorage.setItem(key(salonId), "1");
  } catch {
    // Storage blocked: the in-memory flag still covers this session.
  }
}

export function isSetupDismissed(salonId: string): boolean {
  if (memory.has(salonId)) return true;
  try {
    return (
      Platform.OS === "web" &&
      typeof localStorage !== "undefined" &&
      localStorage.getItem(key(salonId)) === "1"
    );
  } catch {
    return false;
  }
}
