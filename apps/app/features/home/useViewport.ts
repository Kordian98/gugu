import { useSyncExternalStore } from "react";
import { Platform, useWindowDimensions } from "react-native";

const noopSubscribe = () => () => undefined;

/**
 * Hydration-safe viewport. On web the server cannot know the window size, so the first client render must
 * match the server markup: `mounted` is false until after hydration, then real dimensions are used.
 */
export function useViewport(): { mounted: boolean; width: number; height: number } {
  const { width, height } = useWindowDimensions();
  // Server snapshot = false during SSR and hydration; client snapshot = true afterwards.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => Platform.OS !== "web",
  );
  return { mounted, width, height };
}
