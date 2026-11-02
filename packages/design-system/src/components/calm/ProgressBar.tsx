import { View } from "react-native";

import { useCalm } from "../../calm";

/** Thin rounded progress track; optional second segment (e.g. remaining vs done). */
export function ProgressBar({
  value,
  secondary,
  width,
  height = 6,
}: {
  value: number;
  secondary?: number | undefined;
  width: number | `${number}%`;
  height?: number | undefined;
}) {
  const { c } = useCalm();
  const pct = (v: number) => `${String(Math.max(0, Math.min(1, v)) * 100)}%` as const;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        width,
        height,
        borderRadius: height,
        backgroundColor: c.surfaceMuted,
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      <View style={{ width: pct(value), backgroundColor: c.accentBg }} />
      {secondary !== undefined ? (
        <View style={{ width: pct(secondary), backgroundColor: c.event.inProgress.border }} />
      ) : null}
    </View>
  );
}
