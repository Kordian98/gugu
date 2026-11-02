import { View } from "react-native";

import { useCalm } from "../../calm";
import { Text } from "../Text";

export type PillTone = "up" | "down" | "accent" | "neutral" | "brand";

/** Small rounded label: deltas, statuses, revenue kinds, "BUSINESS". Always text, never colour alone. */
export function Pill({
  align = "flex-start",
  label,
  tone = "neutral",
  size = 12,
}: {
  label: string;
  align?: "flex-start" | "center" | undefined;
  tone?: PillTone | undefined;
  size?: number | undefined;
}) {
  const { c } = useCalm();
  const t =
    tone === "up"
      ? c.up
      : tone === "down"
        ? c.down
        : tone === "accent"
          ? { bg: c.accentSoft, text: c.accent }
          : tone === "brand"
            ? { bg: c.badgeBg, text: c.badgeText }
            : { bg: c.surfaceMuted, text: c.body };
  return (
    <View
      style={{
        alignSelf: align,
        backgroundColor: t.bg,
        borderRadius: 999,
        paddingHorizontal: size * 0.6,
        paddingVertical: size * 0.18,
      }}
    >
      <Text role="uiMedium" size={size} lineHeight={size * 1.35} color={t.text}>
        {label}
      </Text>
    </View>
  );
}
