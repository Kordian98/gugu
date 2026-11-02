import type { ReactNode } from "react";
import { Text as RNText, type StyleProp, type TextStyle } from "react-native";

import { color as tokens, font } from "../tokens";

export type TextRole =
  | "display" // editorial condensed serif headlines
  | "serif"
  | "serifBold"
  | "ui"
  | "uiMedium"
  | "uiSemiBold"
  | "eyebrow" // tracked uppercase label
  | "script" // handwritten accent
  | "neon"; // condensed signage

const FAMILY: Record<TextRole, string> = {
  display: font.display,
  serif: font.serif,
  serifBold: font.serifBold,
  ui: font.ui,
  uiMedium: font.uiMedium,
  uiSemiBold: font.uiSemiBold,
  eyebrow: font.uiMedium,
  script: font.script,
  neon: font.neon,
};

type Props = {
  role?: TextRole;
  size: number;
  lineHeight?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  children: ReactNode;
};

/** Typography primitive: one family per role (static font files, so no fontWeight juggling). */
export function Text({
  role = "ui",
  size,
  lineHeight,
  color,
  style,
  numberOfLines,
  children,
}: Props) {
  const base: TextStyle = {
    fontFamily: FAMILY[role],
    fontSize: size,
    lineHeight: lineHeight ?? Math.round(size * (role === "display" ? 1.0 : 1.35)),
    color: color ?? (role === "eyebrow" ? tokens.eyebrow : tokens.ink),
    letterSpacing: role === "display" ? -size * 0.035 : role === "eyebrow" ? size * 0.3 : 0,
    textTransform: role === "eyebrow" || role === "neon" ? "uppercase" : "none",
  };
  return (
    <RNText style={[base, style]} numberOfLines={numberOfLines}>
      {children}
    </RNText>
  );
}
