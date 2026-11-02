import Svg, { Circle, Path } from "react-native-svg";

import { color } from "@gugu/design-system";

export type FeatureIconName =
  "link" | "calendar" | "users" | "sparkles" | "chart" | "bell" | "chat";

/** Line icons for the SaaS feature cards (24×24 grid, lilac strokes on a pearl well). */
export function FeatureIcon({
  name,
  size = 26,
  stroke = color.lilac700,
}: {
  name: FeatureIconName;
  size?: number;
  stroke?: string;
}) {
  const s = {
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "link" && (
        <>
          <Path
            d="M4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5v-4A1.5 1.5 0 0 1 4.5 3ZM15.5 3h4A1.5 1.5 0 0 1 21 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 14 8.5v-4A1.5 1.5 0 0 1 15.5 3ZM4.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5v-4A1.5 1.5 0 0 1 4.5 14Z"
            {...s}
          />
          <Path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3" {...s} />
        </>
      )}
      {name === "calendar" && (
        <>
          <Path
            d="M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"
            {...s}
          />
          <Path d="M8 3v4M16 3v4M3.5 10h17M8 14h3M8 17h6" {...s} />
        </>
      )}
      {name === "users" && (
        <>
          <Circle cx={9} cy={8.5} r={3.5} {...s} />
          <Path
            d="M2.5 20c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5M16 5.5a3.2 3.2 0 0 1 0 6.2M18.5 15.3c1.5.8 2.6 2.4 3 4.7"
            {...s}
          />
        </>
      )}
      {name === "sparkles" && (
        <Path
          d="M10 3.5 11.6 8a2 2 0 0 0 1.2 1.2L17.5 11l-4.7 1.7a2 2 0 0 0-1.2 1.2L10 18.5 8.4 14a2 2 0 0 0-1.2-1.2L2.5 11l4.7-1.8A2 2 0 0 0 8.4 8L10 3.5ZM18 3v3M16.5 4.5h3M19 16v4M17 18h4"
          {...s}
        />
      )}
      {name === "chart" && <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...s} />}
      {name === "bell" && (
        <Path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" {...s} />
      )}
      {name === "chat" && (
        <>
          <Path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5v-9Z"
            {...s}
          />
          <Path d="M8.5 9.5h.01M12 9.5h.01M15.5 9.5h.01" {...s} strokeWidth={2.6} />
        </>
      )}
    </Svg>
  );
}
