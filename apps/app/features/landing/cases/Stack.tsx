import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { openZoom } from "../flow/zoom";
import { screen, screenSize } from "../screens";
import type { Case, Layer } from "./data";

type T = (k: string, o?: Record<string, unknown>) => string;

const uri = (m: number) => Asset.fromModule(m).uri;
/** Nominal desktop stack width (px) for `sizes`: files are never shown above their pixels. */
const COL = 620;
const Z = "Z";
const CHECK = "✓";

/** The salon's Zalo OA, illustrated (there is no real inbox capture of the demo salon yet). */
function ZaloCard({ c }: { c: Case }) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const z = `flow.cases.${c.k}.z`;
  return (
    <div className="cx-zalo">
      <div className="zt">
        <i aria-hidden>{Z}</i>
        <b>{t(`flow.cases.${c.k}.name`)}</b>
        <small>{t("flow.cases.zaloOa")}</small>
      </div>
      <p className="zb them">{t(`${z}.msg`)}</p>
      <p className="zb me">{t(`${z}.reply`)}</p>
      <p className="zs">
        <i aria-hidden>{CHECK}</i>
        {t(`${z}.done`)}
      </p>
      <span className="ztag">{t("flow.cases.zaloTag")}</span>
    </div>
  );
}

/** One real crop, or a window onto a region of it, sized to stay readable. */
function ShotLayer({
  l,
  mobile,
  reduce,
}: {
  l: Extract<Layer, { kind: "shot" }>;
  mobile: boolean;
  reduce: boolean;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const locale = useLocale();
  const [full, half] = l.src;
  const { w, h } = screenSize(locale, full);
  const [x0, y0, x1, y1] = l.region ?? [0, 0, 1, 1];
  const rw = x1 - x0;
  const src = uri(screen(locale, full));
  const srcSet =
    full === half
      ? `${src} ${String(w)}w`
      : `${uri(screen(locale, half))} ${String(Math.round((w * 2) / 3))}w, ${src} ${String(w)}w`;
  const alt = t(`flow.cases.alt.${full}`);
  const win: CSSProperties = { aspectRatio: String((rw * w) / ((y1 - y0) * h)) };
  const img: CSSProperties = {
    width: `${String(100 / rw)}%`,
    marginLeft: `${String((-x0 / rw) * 100)}%`,
    marginTop: `${String(((-y0 * h) / w / rw) * 100)}%`,
  };
  const pic = (
    <span className="win" style={win}>
      <img
        src={src}
        srcSet={srcSet}
        sizes={
          mobile
            ? `${String(Math.round(l.w / rw))}vw`
            : `${String(Math.round(((l.w / 100) * COL) / rw))}px`
        }
        width={w}
        height={h}
        alt={alt}
        style={img}
        decoding="async"
        loading="lazy"
      />
    </span>
  );
  if (!mobile) return pic;
  // phones: the card opens the zoom viewer with the whole screen (pinch, drag, Close)
  return (
    <button
      type="button"
      className="cx-zoom"
      aria-label={`${t("flow.m.zoom")}: ${alt}`}
      onClick={(e) => {
        openZoom(
          src,
          srcSet,
          alt,
          { close: t("flow.m.close"), hint: t("flow.m.zoomHint") },
          e.currentTarget,
          reduce,
        );
      }}
    >
      {pic}
      <span className="zi" aria-hidden />
    </button>
  );
}

/**
 * The salon's stack of real CRM screens (owner, 2026-11-05): two or three crops of exactly the
 * features behind its outcomes, layered with an offset and depth, glass edges, an entrance when the
 * story is shown, and (desktop) a gentle pointer parallax and hover-to-front. Phones: two cards, each
 * opens the zoom viewer. Reduced motion: no entrance, no parallax.
 */
export function Stack({
  c,
  active,
  mobile,
  reduce,
}: {
  c: Case;
  active: boolean;
  mobile: boolean;
  reduce: boolean;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const root = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(reduce);
  const layers = mobile ? c.mstack : c.stack;
  useEffect(() => {
    const el = root.current;
    if (!active || !el || reduce) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((x) => x.isIntersecting)) return;
        io.disconnect();
        setShown(true);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [active, reduce]);
  const parallax =
    mobile || reduce
      ? {}
      : {
          onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty(
              "--px",
              ((e.clientX - r.left) / r.width - 0.5).toFixed(3),
            );
            e.currentTarget.style.setProperty(
              "--py",
              ((e.clientY - r.top) / r.height - 0.5).toFixed(3),
            );
          },
          onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
            e.currentTarget.style.setProperty("--px", "0");
            e.currentTarget.style.setProperty("--py", "0");
          },
        };
  return (
    <figure className={`cx-stackfig${shown || reduce ? " shown" : ""}`} ref={root} {...parallax}>
      <div className="cx-stack">
        {layers.map((l, n) => (
          <div
            key={n}
            className={`cx-layer ${l.kind}`}
            style={{
              width: `${String(l.w)}%`,
              marginLeft: `${String(l.x)}%`,
              marginTop: `${String(l.y)}%`,
              ["--d" as string]: n + 1,
              ["--i" as string]: n,
            }}
          >
            <div className="cx-in">
              {l.kind === "zalo" ? (
                <ZaloCard c={c} />
              ) : (
                <ShotLayer l={l} mobile={mobile} reduce={reduce} />
              )}
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        <b>{t(`flow.cases.${c.k}.shot`)}</b>
        <small>{t("flow.cases.shotNote")}</small>
      </figcaption>
    </figure>
  );
}
