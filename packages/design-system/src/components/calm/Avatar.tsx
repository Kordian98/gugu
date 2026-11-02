import { View } from "react-native";

import { useCalm } from "../../calm";
import { Icon } from "../Icon";
import { Text } from "../Text";

const TONES = ["accent", "pink", "peach", "gold"] as const;

/** Initials avatar (no photos of people in the CRM yet). Tone is derived from the name, stable per person. */
export function Avatar({ name, size }: { name?: string | undefined; size: number }) {
  const { c } = useCalm();
  const initials = (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  let sum = 0;
  for (let i = 0; i < (name ?? "").length; i++) sum += (name ?? "").charCodeAt(i);
  const tone = TONES[sum % TONES.length];
  const bg =
    tone === "accent"
      ? c.event.confirmed.bg
      : tone === "pink"
        ? c.event.inProgress.bg
        : tone === "peach"
          ? c.event.pending.bg
          : c.surfaceMuted;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor: c.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {initials ? (
        <Text role="uiSemiBold" size={size * 0.38} lineHeight={size * 0.5} color={c.ink}>
          {initials}
        </Text>
      ) : (
        <Icon name="users" size={size * 0.5} color={c.body} />
      )}
    </View>
  );
}
