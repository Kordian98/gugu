import Svg, { Circle, Path } from "react-native-svg";

import { color as tokens } from "../tokens";

export type IconName =
  | "search"
  | "chevronRight"
  | "chevronLeft"
  | "chevronDown"
  | "arrowRight"
  | "pin"
  | "heart"
  | "star";

type Props = {
  name: IconName;
  size: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
};

/** Line icon set used by the marketing pages (24×24 grid, round caps). */
export function Icon({ name, size, color = tokens.ink, strokeWidth = 2, filled = false }: Props) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "search" && (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="m20 20-3.6-3.6" {...common} />
        </>
      )}
      {name === "chevronRight" && <Path d="m9 5 7 7-7 7" {...common} />}
      {name === "chevronLeft" && <Path d="m15 5-7 7 7 7" {...common} />}
      {name === "chevronDown" && <Path d="m6 9 6 6 6-6" {...common} />}
      {name === "arrowRight" && <Path d="M5 12h14M13 6l6 6-6 6" {...common} />}
      {name === "pin" && (
        <>
          <Path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" {...common} />
          <Circle cx={12} cy={9.5} r={2.5} {...common} />
        </>
      )}
      {name === "star" && (
        <Path
          d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      )}
      {name === "heart" && (
        <Path
          d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"
          {...common}
          fill={filled ? color : "none"}
        />
      )}
    </Svg>
  );
}
