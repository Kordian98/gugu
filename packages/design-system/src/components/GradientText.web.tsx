import type { CSSProperties, ReactNode } from "react";
import type { TextStyle } from "react-native";

/** Web: CSS linear-gradient clipped to text. Extra bottom padding keeps descenders/diacritics unclipped. */
export function GradientText({
  colors,
  style,
  children,
}: {
  colors: readonly string[];
  style?: TextStyle;
  children: ReactNode;
}) {
  const css: CSSProperties = {
    fontFamily: style?.fontFamily,
    fontSize: style?.fontSize,
    letterSpacing: style?.letterSpacing,
    backgroundImage: `linear-gradient(90deg, ${colors.join(", ")})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    paddingRight: "0.06em",
    paddingBottom: "0.14em",
  };
  return <span style={css}>{children}</span>;
}
