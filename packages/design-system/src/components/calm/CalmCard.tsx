import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useCalm } from "../../calm";
import { radius } from "../../tokens";

/** Calm-mode card: surface colour, hairline border, soft radius; no shadow (07 §3.11). */
export function CalmCard({
  children,
  padding = 18,
  style,
  testID,
}: {
  children: ReactNode;
  padding?: number | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.line,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
