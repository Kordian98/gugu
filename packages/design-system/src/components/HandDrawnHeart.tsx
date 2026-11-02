import Svg, { Path } from "react-native-svg";

/** One-stroke hand-drawn heart used next to handwritten accents (replaces the ♡ glyph). */
export const HAND_HEART_PATH =
  "M13.4 8.1C11.9 3.6 6.1 2.7 4.1 6.7 2 11 6.6 15.8 12.7 21.5 17.9 16 23.7 11.3 22.5 6.4 21.4 2.5 15.7 2.9 13.5 7.8l-.7 1.6";

export function HandDrawnHeart({
  size,
  color,
  strokeWidth = 1.7,
}: {
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size * 1.08} height={size} viewBox="0 0 26 24">
      <Path
        d={HAND_HEART_PATH}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
