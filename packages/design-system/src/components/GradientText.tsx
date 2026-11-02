import type { ReactNode } from "react";
import { Text as RNText, type TextStyle } from "react-native";

/**
 * Gradient-filled text. Native fallback: the gradient's middle colour (no MaskedView dependency yet).
 * The web implementation (GradientText.web.tsx) clips a real CSS gradient to the glyphs.
 */
export function GradientText({
  colors,
  style,
  children,
}: {
  colors: readonly string[];
  style?: TextStyle;
  children: ReactNode;
}) {
  return (
    <RNText style={[style, { color: colors[Math.floor(colors.length / 2)] }]}>{children}</RNText>
  );
}
