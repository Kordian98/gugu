import Svg, { Circle, Path } from "react-native-svg";

import { color } from "@gugu/design-system";

export type BusinessKind = "hair" | "nails" | "barber" | "spa" | "aesthetics";

/** Line illustrations for the business-type tiles (40×40 grid, lilac + rose strokes). */
export function BusinessIcon({ kind, size = 56 }: { kind: BusinessKind; size?: number }) {
  const a = {
    stroke: color.lilac700,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  } as const;
  const b = { ...a, stroke: color.rose500 } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {kind === "hair" && (
        <>
          <Circle cx={10} cy={28} r={4} {...a} />
          <Circle cx={20} cy={28} r={4} {...a} />
          <Path d="M12.5 25 24 8M17.5 25 6 8" {...a} />
          <Path d="M26 14h7a3 3 0 0 1 0 6h-7v-6ZM28 20l-1.5 9h3L31 20" {...b} />
        </>
      )}
      {kind === "nails" && (
        <>
          <Path d="M14 16h12v15a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V16Z" {...b} />
          <Path d="M17 16V9h6v7M18 6h4" {...a} />
          <Path d="M17.5 24h5" {...b} />
        </>
      )}
      {kind === "barber" && (
        <>
          <Path d="M15 5h10v4H15zM15 31h10v4H15z" {...a} />
          <Path d="M16 9h8v22h-8z" {...a} />
          <Path d="m16 12 8 5M16 19l8 5M16 26l8 4" {...b} />
        </>
      )}
      {kind === "spa" && (
        <>
          <Path d="M8 33h24M11 33c0-3 4-5 9-5s9 2 9 5" {...a} />
          <Path d="M13 27c0-2.5 3-4 7-4s7 1.5 7 4" {...a} />
          <Path d="M20 20c-4-2-5-7-1-12 4 5 3 10 1 12ZM20 20c3-1 6-1 8-4-3-1-6 0-8 4Z" {...b} />
        </>
      )}
      {kind === "aesthetics" && (
        <>
          <Path d="M10 18h8v15h-8zM12 18v-6l4-3v9" {...b} />
          <Path d="M24 22h8v11h-8zM26 22v-4h4v4" {...a} />
          <Path d="M28 14c0-2 1-3 2-3" {...a} />
        </>
      )}
    </Svg>
  );
}
