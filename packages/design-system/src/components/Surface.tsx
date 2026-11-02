import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { color } from "../tokens";

/** Rounded container: "pill" (white, hairline), "card" (white, hairline, soft shadow), "glass" (translucent). */
export function Surface({
  variant,
  radius,
  style,
  children,
}: {
  variant: "pill" | "card" | "glass";
  radius: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const v: ViewStyle =
    variant === "glass"
      ? {
          backgroundColor: "rgba(255,255,255,0.4)",
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.95)",
        }
      : variant === "pill"
        ? {
            backgroundColor: "rgba(255,255,255,0.8)",
            borderWidth: 1,
            borderColor: "rgba(238,228,224,0.9)",
          }
        : { backgroundColor: color.white, borderWidth: 1, borderColor: color.lineSoft };
  return <View style={[{ borderRadius: radius, overflow: "hidden" }, v, style]}>{children}</View>;
}

/** Pressable card with web hover lift and press scale. */
export function PressableCard({
  radius,
  onPress,
  accessibilityLabel,
  style,
  children,
}: {
  radius: number;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered === true;
        return [
          {
            borderRadius: radius,
            backgroundColor: color.white,
            borderWidth: 1,
            borderColor: color.lineSoft,
            overflow: "hidden",
            shadowColor: color.ink,
            shadowOpacity: hovered ? 0.1 : 0,
            shadowRadius: 25,
            shadowOffset: { width: 0, height: 9 },
            transform: [{ translateY: hovered ? -4 : 0 }, { scale: state.pressed ? 0.99 : 1 }],
          } satisfies ViewStyle,
          style,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}
