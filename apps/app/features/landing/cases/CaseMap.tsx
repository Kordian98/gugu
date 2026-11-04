import { useTranslation } from "react-i18next";

import type { Case } from "./data";
import { Glyph } from "./Glyph";

type T = (k: string, o?: Record<string, unknown>) => string;

/** The tangle (positions in % of the map, tilt) and its crossing wires (320 × 200 viewBox). */
const TANGLE = [
  { x: 22, y: 26, r: -4 },
  { x: 76, y: 22, r: 3 },
  { x: 26, y: 76, r: 2 },
  { x: 74, y: 80, r: -3 },
] as const;
/** Crossing wires between the notes, in % of the map: [from, control 1, control 2, to] (x, y). */
const WIRES = [
  [22, 26, 56, 85, 41, 10, 74, 80],
  [76, 22, 38, 40, 62, 95, 26, 76],
  [22, 26, 47, 50, 53, 0, 76, 22],
  [26, 76, 53, 45, 50, 105, 74, 80],
  [22, 26, 6, 55, 38, 50, 26, 76],
  [76, 22, 94, 50, 62, 60, 74, 80],
] as const;
const wire = (w: readonly number[], W: number, H: number) => {
  const p = (i: number) =>
    `${(((w[i] ?? 0) * W) / 100).toFixed(1)} ${(((w[i + 1] ?? 0) * H) / 100).toFixed(1)}`;
  return `M${p(0)} C ${p(2)}, ${p(4)}, ${p(6)}`;
};
/** The GuGu Studio flow: four nodes left → right (x in %), arrows between the discs. */
const FLOW_X = [12.5, 37.5, 62.5, 87.5] as const;
const arrow = (i: number, y: number) => {
  const a = ((FLOW_X[i] ?? 0) / 100) * MAP_W + 26;
  const b = ((FLOW_X[i + 1] ?? 0) / 100) * MAP_W - 26;
  return `M${String(a)} ${String(y)} H${String(b)} M${String(b - 5)} ${String(y - 5)} L${String(b)} ${String(y)} L${String(b - 5)} ${String(y + 5)}`;
};
/** Map box (viewBox = CSS aspect ratio): wider on desktop; the flow sits at `FLOW_Y` of the height. */
const MAP_W = 320;
const MAP_H = { d: 150, m: 200 } as const;
const FLOW_Y = { d: 0.42, m: 0.4 } as const;

/** Before → after map: the old tangle of tools, then the GuGu Studio flow drawing on. */
export function CaseMap({
  c,
  after,
  setAfter,
  mobile,
  mapRef,
}: {
  c: Case;
  after: boolean;
  setAfter: (v: boolean) => void;
  mobile: boolean;
  mapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const H = mobile ? MAP_H.m : MAP_H.d;
  const y = (mobile ? FLOW_Y.m : FLOW_Y.d) * H;
  return (
    <div className={`cx-map${after ? " after" : ""}`} ref={mapRef}>
      <div className="cx-mh">
        <span className="cx-tags" aria-hidden>
          <span className="cx-tag b">{t("flow.cases.before")}</span>
          <span className="cx-tag a">{t("flow.cases.afterLong")}</span>
        </span>
        <div className="cx-tg" role="group" aria-label={t("flow.cases.mapLabel")}>
          <button
            type="button"
            aria-pressed={!after}
            onClick={() => {
              setAfter(false);
            }}
          >
            {t("flow.cases.before")}
          </button>
          <button
            type="button"
            aria-pressed={after}
            onClick={() => {
              setAfter(true);
            }}
          >
            {t("flow.cases.after")}
          </button>
        </div>
      </div>
      <div className="cx-dia">
        <svg
          className="cx-svg"
          viewBox={`0 0 ${String(MAP_W)} ${String(H)}`}
          aria-hidden
          focusable="false"
        >
          <g className="cx-tangle">
            {WIRES.map((w) => (
              <path key={w.join()} d={wire(w, MAP_W, H)} />
            ))}
          </g>
          <g className="cx-flow">
            {FLOW_X.slice(1).map((x, i) => (
              <path key={x} d={arrow(i, y)} pathLength={1} style={{ ["--i" as string]: i }} />
            ))}
          </g>
        </svg>
        {/* labels are live text (translatable, AA); only the inactive state is hidden from AT */}
        <ol className="cx-nodes b" aria-label={t("flow.cases.before")} aria-hidden={after}>
          {c.before.map((g, i) => (
            <li
              key={g + String(i)}
              style={{
                left: `${String(TANGLE[i]?.x ?? 0)}%`,
                top: `${String(TANGLE[i]?.y ?? 0)}%`,
                ["--r" as string]: `${String(TANGLE[i]?.r ?? 0)}deg`,
                ["--i" as string]: i,
              }}
            >
              <Glyph name={g} />
              {t(`flow.cases.${c.k}.b${String(i + 1)}`)}
            </li>
          ))}
        </ol>
        <ol className="cx-nodes a" aria-label={t("flow.cases.afterLong")} aria-hidden={!after}>
          {c.after.map((g, i) => (
            <li
              key={g + String(i)}
              style={{ left: `${String(FLOW_X[i] ?? 0)}%`, ["--i" as string]: i }}
            >
              <span className="d">
                <Glyph name={g} />
              </span>
              {t(`flow.cases.${c.k}.a${String(i + 1)}`)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
