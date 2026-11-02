import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { useCalm } from "../../calm";

/** Minimal trend line with a soft lilac area fill. Values are plotted left → right, scaled to fit. */
export function Sparkline({
  values,
  width,
  height,
}: {
  values: number[];
  width: number;
  height: number;
}) {
  const { c } = useCalm();
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${String(x)} ${String(y)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.accentBg} stopOpacity={0.35} />
          <Stop offset="1" stopColor={c.accentBg} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path
        d={`${line} L${String(width)} ${String(height)} L0 ${String(height)} Z`}
        fill={`url(#${id})`}
      />
      <Path
        d={line}
        stroke={c.accentBg}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
