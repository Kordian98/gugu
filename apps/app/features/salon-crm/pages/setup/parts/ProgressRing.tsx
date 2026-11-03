import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Text, useCalm } from "@gugu/design-system";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Setup progress ring: fills as steps complete; the label is the step count ("2/5"). */
export function ProgressRing({
  value,
  label,
  size = 52,
  accessibilityLabel,
}: {
  value: number;
  label: string;
  size?: number;
  accessibilityLabel: string;
}) {
  const { c } = useCalm();
  const reduce = useReducedMotion();
  const stroke = 5;
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const progress = useSharedValue(value);
  useEffect(() => {
    progress.value = reduce ? value : withTiming(value, { duration: 600 });
  }, [value, reduce, progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - Math.min(1, Math.max(0, progress.value))),
  }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.line}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.accentBg}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${String(length)} ${String(length)}`}
          animatedProps={animatedProps}
        />
      </Svg>
      <Text role="uiSemiBold" size={13} color={c.ink}>
        {label}
      </Text>
    </View>
  );
}
