import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { touchSlop } from "../../a11y";
import { useCalm } from "../../calm";
import { Icon, type IconName } from "../Icon";
import { Text } from "../Text";

type Variant = "primary" | "secondary" | "ghost";

/** Calm-mode button. Primary = lilac with plum text (AA 6.2:1), secondary = surface + hairline. */
export function CalmButton({
  label,
  onPress,
  variant = "primary",
  icon,
  size = "md",
  accessibilityLabel,
  trailing,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant | undefined;
  icon?: IconName | undefined;
  size?: "sm" | "md" | undefined;
  accessibilityLabel?: string | undefined;
  trailing?: ReactNode | undefined;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  const h = size === "sm" ? 34 : 40;
  const fs = size === "sm" ? 13 : 14;
  const fg = variant === "primary" ? c.onAccent : variant === "ghost" ? c.accent : c.ink;
  // Visually 34/40 pt, but the pressable itself is 44 pt tall with a negative vertical margin:
  // the touch area meets 44 pt on web and native while the layout footprint stays `h`
  // (react-native-web ignores hitSlop and cancels presses released outside the element).
  const slop = touchSlop(0, h);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={{
        minHeight: h + slop.top + slop.bottom,
        marginVertical: -slop.top,
        justifyContent: "center",
      }}
    >
      {(state) => {
        const hovered = (state as { hovered?: boolean | undefined }).hovered === true;
        return (
          <View
            style={{
              height: h,
              paddingHorizontal: h * 0.4,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor:
                variant === "primary"
                  ? c.accentBg
                  : variant === "secondary"
                    ? c.surface
                    : hovered
                      ? c.accentSoft
                      : "transparent",
              borderWidth: variant === "secondary" ? 1 : 0,
              borderColor: hovered ? c.accentBg : c.line,
              opacity: state.pressed ? 0.85 : hovered && variant === "primary" ? 0.92 : 1,
            }}
          >
            {icon ? <Icon name={icon} size={fs + 3} color={fg} /> : null}
            <Text role="uiSemiBold" size={fs} lineHeight={fs * 1.3} color={fg}>
              {label}
            </Text>
            {trailing !== undefined ? <View>{trailing}</View> : null}
          </View>
        );
      }}
    </Pressable>
  );
}
