import { useTranslation } from "react-i18next";

import type { Case } from "./data";
import { Glyph } from "./Glyph";

type T = (k: string, o?: Record<string, unknown>) => string;

/** Map box (viewBox = the CSS aspect ratio of `.cx-dia`): taller on phones for 14 px labels. */
const MAP_W = 320;
const MAP_H = { d: 180, m: 300 } as const;
/** The GuGu Studio flow: four nodes left → right (x in %), at `FLOW_Y` of the height. */
const FLOW_X = [12.5, 37.5, 62.5, 87.5] as const;
const FLOW_Y = { d: 0.4, m: 0.34 } as const;
const ARROW = "→";
const WARN = "!";

const arrow = (i: number, y: number) => {
  const a = ((FLOW_X[i] ?? 0) / 100) * MAP_W + 26;
  const b = ((FLOW_X[i + 1] ?? 0) / 100) * MAP_W - 26;
  return `M${String(a)} ${String(y)} H${String(b)} M${String(b - 5)} ${String(y - 5)} L${String(b)} ${String(y)} L${String(b - 5)} ${String(y + 5)}`;
};

/** A curved wire between two notes: a quadratic bend perpendicular to the line (viewBox px). */
/** The same clamp as the CSS (`.cx-nodes.b li`): notes, and so the wire ends, stay inside the map. */
const CLAMP = { d: { x: [19, 81], y: [12, 88] }, m: { x: [21, 79], y: [10, 90] } } as const;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

function wire(c: Case, i: number, H: number, mobile: boolean) {
  const w = c.wires[i];
  const a = w ? c.before[w.from] : undefined;
  const b = w ? c.before[w.to] : undefined;
  if (!w || !a || !b) return { d: "", mid: { x: 0, y: 0 }, bad: false };
  const k = mobile ? CLAMP.m : CLAMP.d;
  const ax = (clamp(a.x, k.x) / 100) * MAP_W;
  const ay = (clamp(a.y, k.y) / 100) * H;
  const bx = (clamp(b.x, k.x) / 100) * MAP_W;
  const by = (clamp(b.y, k.y) / 100) * H;
  const len = Math.max(1, Math.hypot(bx - ax, by - ay));
  const cx = (ax + bx) / 2 + (-(by - ay) / len) * w.bend;
  const cy = (ay + by) / 2 + ((bx - ax) / len) * w.bend;
  // the curve's midpoint (t = 0.5) carries the "!" of a wire that goes wrong
  const mid = { x: (ax + 2 * cx + bx) / 4, y: (ay + 2 * cy + by) / 4 };
  const f = (n: number) => n.toFixed(1);
  return {
    d: `M${f(ax)} ${f(ay)} Q ${f(cx)} ${f(cy)}, ${f(bx)} ${f(by)}`,
    mid,
    bad: w.bad === true,
  };
}

/**
 * Before → after map of ONE salon: its own old way (paper notes joined by crawling wires; the wire
 * where it goes wrong is solid red with a "!"), then the GuGu Studio flow that resolves each of those
 * pains, with one line saying how. Manual only (owner, 2026-11-05): it starts on "Trước" and changes
 * when the visitor picks "Sau" (the toggle or the "Xem sau" button); the flow draws on then.
 */
export function CaseMap({
  c,
  after,
  setAfter,
  mobile,
}: {
  c: Case;
  after: boolean;
  setAfter: (v: boolean) => void;
  mobile: boolean;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const H = mobile ? MAP_H.m : MAP_H.d;
  const y = (mobile ? FLOW_Y.m : FLOW_Y.d) * H;
  const wires = c.wires.map((_, i) => wire(c, i, H, mobile));
  return (
    <div className={`cx-map${after ? " after" : ""}`}>
      <div className="cx-mh">
        <span className="cx-mt">
          <span className="b">{t(`flow.cases.${c.k}.mapBefore`)}</span>
          <span className="a">{t("flow.cases.afterLong")}</span>
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
            {wires.map((w) => (
              <path key={w.d} d={w.d} className={w.bad ? "bad" : undefined} />
            ))}
            {wires
              .filter((w) => w.bad)
              .map((w) => (
                <g key={`m${w.d}`} className="cx-warn">
                  <circle cx={w.mid.x} cy={w.mid.y} r={9} />
                  <text x={w.mid.x} y={w.mid.y + 4} textAnchor="middle">
                    {WARN}
                  </text>
                </g>
              ))}
          </g>
          <g className="cx-flow">
            {FLOW_X.slice(1).map((x, i) => (
              <path key={x} d={arrow(i, y)} pathLength={1} style={{ ["--i" as string]: i }} />
            ))}
          </g>
        </svg>
        {/* labels are live text (translatable, AA); only the visible side reaches assistive tech */}
        <ol
          className="cx-nodes b"
          aria-label={t(`flow.cases.${c.k}.mapBefore`)}
          aria-hidden={after}
        >
          {c.before.map((n, i) => (
            <li
              key={n.g + String(i)}
              style={{
                ["--x" as string]: `${String(n.x)}%`,
                ["--y" as string]: `${String(n.y)}%`,
                ["--r" as string]: `${String(n.r)}deg`,
                ["--i" as string]: i,
              }}
            >
              <Glyph name={n.g} />
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
      {/* footer: the way into "after" until it is shown, then the line that says how it is solved */}
      <div className="cx-mf">
        <p className="cx-fix" aria-hidden={!after}>
          {t(`flow.cases.${c.k}.fix`)}
        </p>
        <button
          type="button"
          className="cx-see"
          hidden={after}
          onClick={() => {
            setAfter(true);
          }}
        >
          {t("flow.cases.see")}
          <i aria-hidden>{ARROW}</i>
        </button>
      </div>
    </div>
  );
}
