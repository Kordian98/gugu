import type { ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

import { color } from "../tokens";

type Props = {
  size: number;
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Circular white button with hairline border (search, language, carousel arrows). */
export function IconButton({ size, onPress, accessibilityLabel, children, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={(state) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color.white,
          borderWidth: 1,
          borderColor:
            (state as { hovered?: boolean }).hovered === true ? color.lilac500 : color.line,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: state.pressed ? 0.94 : 1 }],
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
