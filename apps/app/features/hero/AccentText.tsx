import { View, type ViewStyle } from "react-native";

import { HandDrawnHeart, Text, type TextRole } from "@gugu/design-system";

/** "♡" in a translation marks where the hand-drawn heart goes. */
const HEART_MARK = String.fromCharCode(0x2661);

/**
 * Multi-line accent text where "♡" in the translation becomes a hand-drawn heart.
 * Lines come from "\n" in the dictionary string.
 */
export function AccentText({
  text,
  role,
  size,
  lineHeight,
  color,
  align = "left",
  style,
  heartScale = 1,
}: {
  text: string;
  role: TextRole;
  size: number;
  lineHeight: number;
  color: string;
  align?: "left" | "center" | "right";
  style?: ViewStyle;
  heartScale?: number;
}) {
  const lines = text.split("\n");
  const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  return (
    <View style={style} pointerEvents="none">
      {lines.map((line, i) => {
        const parts = line.split(HEART_MARK);
        return (
          <View
            key={i}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: justify,
              minHeight: lineHeight,
            }}
          >
            {parts[0] !== "" ? (
              <Text role={role} size={size} lineHeight={lineHeight} color={color}>
                {parts[0]?.trimEnd()}
              </Text>
            ) : null}
            {parts.length > 1 ? (
              <View style={{ marginLeft: parts[0] === "" ? 0 : size * 0.2 }}>
                <HandDrawnHeart size={size * 0.85 * heartScale} color={color} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
