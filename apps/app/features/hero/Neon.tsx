import { useEffect, type ReactNode } from "react";
import type { TextStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { color, font } from "@gugu/design-system";

/** Neon sign text with an occasional flicker. */
export function Neon({
  children,
  size,
  lineHeight,
  delay = 0,
  style,
}: {
  children: ReactNode;
  size: number;
  lineHeight: number;
  delay?: number;
  style?: TextStyle;
}) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 3300 }),
          withTiming(0.55, { duration: 60 }),
          withTiming(1, { duration: 80 }),
          withTiming(0.7, { duration: 60 }),
          withTiming(1, { duration: 3500 }),
        ),
        -1,
      ),
    );
  }, [reduce, delay, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.Text
      style={[
        {
          fontFamily: font.neon,
          fontSize: size,
          lineHeight,
          letterSpacing: size * 0.07,
          textTransform: "uppercase",
          color: color.neon,
          textShadowColor: color.neonGlow,
          textShadowRadius: size * 0.45,
          textShadowOffset: { width: 0, height: 0 },
        },
        style,
        a,
      ]}
    >
      {children}
    </Animated.Text>
  );
}
