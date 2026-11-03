import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Light success tap on native when a setup step completes; nothing on web. Never throws. */
export function successHaptic(): void {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function selectHaptic(): void {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => undefined);
}
