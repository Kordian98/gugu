import { useEffect, type ReactNode } from "react";
import { Platform, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** Gentle bob + tilt loop with optional mouse parallax (web, desktop) for floating props. */
export function Float({
  children,
  style,
  duration = 5500,
  delay = 0,
  depth = 0,
  amplitude = 12,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  delay?: number;
  depth?: number;
  amplitude?: number;
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  const px = useSharedValue(0);
  const py = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    const start = setTimeout(() => {
      t.value = withRepeat(
        withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    }, delay);
    if (Platform.OS !== "web" || depth === 0)
      return () => {
        clearTimeout(start);
      };
    const onMove = (e: PointerEvent) => {
      px.value = withTiming((e.clientX / window.innerWidth - 0.5) * depth, { duration: 300 });
      py.value = withTiming((e.clientY / window.innerHeight - 0.5) * depth, { duration: 300 });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      clearTimeout(start);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduce, duration, delay, depth, t, px, py]);
  const a = useAnimatedStyle(() => ({
    transform: [
      { translateX: px.value },
      { translateY: py.value - t.value * amplitude },
      { rotate: `${String(-3 + t.value * 6)}deg` },
    ],
  }));
  return (
    <Animated.View style={[style, a]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}
