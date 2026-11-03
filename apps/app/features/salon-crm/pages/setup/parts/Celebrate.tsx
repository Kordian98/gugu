import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Icon, color, useCalm } from "@gugu/design-system";

/** Brand confetti only (Lilac Glow tokens): lilac, pink, peach. */
const PALETTE = [color.lilac500, color.pink300, color.peach400, color.lilac300];

/**
 * Small confetti burst from the centre of its parent. Purely decorative (hidden from screen readers)
 * and skipped entirely when the user asks for reduced motion. Re-runs whenever `burst` changes.
 */
export function Confetti({
  burst,
  pieces = 18,
  spread = 140,
}: {
  burst: number;
  pieces?: number;
  spread?: number;
}) {
  const reduce = useReducedMotion();
  const seeds = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + (i % 3) * 0.35;
        const dist = spread * (0.55 + ((i * 37) % 45) / 100);
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist * 0.75 - spread * 0.25,
          rot: ((i * 53) % 360) - 180,
          size: 6 + (i % 3) * 2,
          round: i % 2 === 0,
          fill: PALETTE[i % PALETTE.length] ?? color.lilac500,
        };
      }),
    [pieces, spread],
  );
  if (reduce || burst === 0) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}
    >
      {seeds.map((s, i) => (
        <Piece key={`${String(burst)}-${String(i)}`} {...s} />
      ))}
    </View>
  );
}

function Piece({
  dx,
  dy,
  rot,
  size,
  round,
  fill,
}: {
  dx: number;
  dy: number;
  rot: number;
  size: number;
  round: boolean;
  fill: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [
      { translateX: dx * t.value },
      // A little gravity: up and out first, then a short fall.
      { translateY: dy * t.value + 60 * t.value * t.value },
      { rotate: `${String(rot * t.value)}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: round ? size : size * 0.5,
          borderRadius: round ? size / 2 : 2,
          backgroundColor: fill,
        },
        style,
      ]}
    />
  );
}

/** Check mark that pops in (spring) when a step completes; static with reduced motion. */
export function CheckPop({ size = 56, testID }: { size?: number; testID?: string | undefined }) {
  const { c } = useCalm();
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.3);
  useEffect(() => {
    if (reduce) return;
    scale.value = withSequence(
      withSpring(1.12, { damping: 9, stiffness: 220 }),
      withDelay(40, withSpring(1, { damping: 12 })),
    );
  }, [reduce, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.accentBg,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Icon name="check" size={size * 0.5} color={c.onAccent} strokeWidth={2.8} />
    </Animated.View>
  );
}
