import { useLayoutEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, screenSize, type ScreenName } from "../screens";
import type { LandingNavActions } from "../useLandingNav";
import { MobileChat } from "./MobileChat";
import { MOBILE_CSS, WALK_MS } from "./mobile.css";
import { AI_STEPS, AiViz, CLIENT_STEPS } from "./Perspectives";
import { EarningsCard } from "./Rooms";
import { WalkPlayer, frameUrl, type Segment } from "./sequence";
import { StaticHero } from "./StaticHero";
import { scrollParent } from "./timelines";
import { openZoom } from "./zoom";

const CHECK = "✓";
const CROSS = "✕";
const PIN = "●";
const Z = "Z";
const SEP = " · ";
const ARROW_D = "↓";
const NOTES = ["n1", "n2", "n3", "n4"] as const;
const BEFORE = ["b1", "b2", "b3", "b4"] as const;
const GAINS = ["g1", "g2", "g3"] as const;
const INS = ["i1", "i3", "i5"] as const;
const PAY = ["p1", "p3", "p5"] as const;
const SW_STEPS = ["st1", "st2", "st3", "st4"] as const;
const SW_ROWS = ["1", "2", "3", "4"] as const;

/** Portrait stills (aligned with the walk frames; ≤ 1.15× of their pixels on any phone). */
const M = {
  stress: "/studio/photo/m/stress.webp",
  calm: "/studio/photo/m/calm.webp",
  treat: frameUrl("w2", true, 89),
  office: frameUrl("w3", true, 89),
};
/** Landscape phones: the 16:9 stills. */
const L = {
  stress: "/studio/photo/stress-169.webp",
  calm: "/studio/photo/calm-169.webp",
  treat: frameUrl("w2", false, 89),
  office: frameUrl("w3", false, 89),
};
const LAND = "(orientation: landscape)";
function Still({ k, className }: { k: keyof typeof M; className?: string }) {
  return (
    <picture>
      <source media={LAND} srcSet={L[k]} />
      <img className={className} src={M[k]} alt="" decoding="async" loading="lazy" />
    </picture>
  );
}

/** Chapters of the chapter bar → the snap units they cover (DOM order of `.mj-u`). */
const CHAPTERS = [
  { k: "c1", label: "flow.hud.c1" },
  { k: "c2", label: "flow.hud.c2" },
  { k: "c3", label: "flow.hud.c3" },
  { k: "c4", label: "flow.hud.c4" },
  { k: "client", label: "views.tab.client" },
  { k: "ai", label: "views.tab.ai" },
] as const;
type Ch = (typeof CHAPTERS)[number]["k"];

/** Salon sections in order; client + AI chats follow (one snap unit per step). */
const SALON = 12;
const CLIENT0 = SALON;
const AI0 = SALON + CLIENT_STEPS.length;
const UNITS = AI0 + AI_STEPS.length;

/** Walks played when their section is reached (once per visit), and the still they end on. */
const WALK_OF: Record<string, Segment> = { desk: "w1", treat: "w2", office: "w3" };
/**
 * Scroll the RN Web ScrollView's DOM node: RN Web puts its own `scrollTo({ x, y, animated })` on the node,
 * so call the DOM method.
 */
const scrollY = (sc: HTMLElement, top: number, smooth: boolean) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the node as `this`
  const domScrollTo = Element.prototype.scrollTo as (this: Element, o: ScrollToOptions) => void;
  domScrollTo.call(sc, { top, behavior: smooth ? "smooth" : "auto" });
};
/** Intro once per page load (also across a remount, e.g. a locale switch). */
const played = new Set<Segment>();

type Facts = {
  k: "r1" | "r2" | "r3";
  shot: ScreenName;
  shot2x: ScreenName;
  label: string;
  call: string;
};
const FACTS: readonly Facts[] = [
  { k: "r1", shot: "mCalendar", shot2x: "mCalendar2x", label: "shotCal", call: "chip" },
  {
    k: "r2",
    shot: "mAppointments",
    shot2x: "mAppointments2x",
    label: "shotAppt",
    call: "callAppt",
  },
  { k: "r3", shot: "mServices", shot2x: "mServices2x", label: "shotSvc", call: "callSvc" },
];

/**
 * One real CRM crop taken at a phone viewport (scripts/landing-screens.mjs `m-*`), shown at about 1:1;
 * a tap opens the zoom viewer (pinch / double-tap). `sizes` = the displayed width.
 */
function MShot({
  name,
  name2x,
  caption,
  call,
  reduce,
  h,
}: {
  name: ScreenName;
  name2x: ScreenName;
  caption: string;
  call?: string;
  reduce: boolean;
  h?: string;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const src = Asset.fromModule(screen(locale, name)).uri;
  const src2x = Asset.fromModule(screen(locale, name2x)).uri;
  const { w, h: ph } = screenSize(locale, name);
  const srcSet = `${src2x} ${String(Math.round((w * 2) / 3))}w, ${src} ${String(w)}w`;
  return (
    <button
      type="button"
      className="mj-shot mj-in"
      style={h ? { ["--shot-h" as string]: h } : undefined}
      aria-label={`${caption}. ${t("flow.m.zoom")}`}
      onClick={(e) => {
        openZoom(
          src,
          srcSet,
          caption,
          { close: t("flow.m.close"), hint: t("flow.m.zoomHint") },
          e.currentTarget,
          reduce,
        );
      }}
    >
      <span className="cap">
        <span>{caption}</span>
        <em aria-hidden>{t("flow.m.zoom")}</em>
      </span>
      <span className="img">
        <img
          src={src}
          srcSet={srcSet}
          sizes="(orientation: landscape) 48vw, calc(100vw - 32px)"
          width={w}
          height={ph}
          alt=""
          decoding="async"
          loading="lazy"
        />
        {call ? (
          <span className="mj-call">
            <i aria-hidden>{PIN}</i>
            {call}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** The copy card; the chevron folds it to its title so the picture is free. */
function Card({
  children,
  head,
  foldable = true,
}: {
  children?: React.ReactNode;
  head: React.ReactNode;
  foldable?: boolean;
}) {
  const { t } = useTranslation("landing");
  const [folded, setFolded] = useState(false);
  return (
    <div className={`mj-card${folded ? " folded" : ""}`}>
      {head}
      {foldable ? (
        <button
          type="button"
          className="mj-fold"
          aria-expanded={!folded}
          aria-label={folded ? t("flow.m.unfold") : t("flow.m.fold")}
          onClick={() => {
            setFolded(!folded);
          }}
        >
          <i aria-hidden />
        </button>
      ) : null}
      <div className="mj-more">{children}</div>
    </div>
  );
}

/**
 * The story on phones (≤ 899 px; ADR-0014 "Mobile"): vertical full-screen sections with CSS scroll snap
 * instead of the desktop book. The hero, then front desk (the walk-in plays once as the intro), the
 * before → after reveal, the treatment room and its three facts, the office (overview, earnings, Insights,
 * payroll), switching, then the client's and the AI's perspectives as scroll-advanced chats. A slim
 * chapter bar on top fills with scroll; a tap on a chapter goes there. Desktop never renders this.
 */
export function MobileJourney({
  nav,
  width,
  reduce,
}: {
  nav: LandingNavActions;
  width: number;
  reduce: boolean;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as (k: string, o?: Record<string, unknown>) => string;
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const heroBlock = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(-1);
  const goRef = useRef<(i: number) => void>(() => undefined);

  useLayoutEffect(() => {
    const el = root.current;
    const hb = heroBlock.current;
    if (!el) return;
    const sc = scrollParent(el);
    const scroller = sc instanceof HTMLElement ? sc : null;
    const units = Array.from(el.querySelectorAll<HTMLElement>(".mj-u"));
    const fills = Array.from(el.querySelectorAll<HTMLElement>(".mj-seg b"));
    const nowName = el.querySelector<HTMLElement>(".mj-now span");
    const nowCount = el.querySelector<HTMLElement>(".mj-now small");
    const segs = Array.from(el.querySelectorAll<HTMLButtonElement>(".mj-seg"));

    // Hero door: the arch shows the first walk frame (same as the stage at time 0 on desktop).
    const syncHero = () => {
      if (!hb) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      // The arch starts below the hero copy (short phones), at least at half the screen.
      const copy = hb.querySelector<HTMLElement>(".jr-hero");
      const btns = copy ? Array.from(copy.querySelectorAll<HTMLElement>("button,a,p,h1")) : [];
      const hbTop = hb.getBoundingClientRect().top;
      const copyBottom = btns.reduce(
        (m, b) => Math.max(m, b.getBoundingClientRect().bottom - hbTop),
        0,
      );
      const top = Math.max(H * 0.5, copyBottom + 18);
      const side = W * 0.05;
      const bottom = H * 0.1;
      const radius = (W - 2 * side) / 2;
      const fr = hb.querySelector<HTMLElement>(".jr-frame");
      const md = hb.querySelector<HTMLElement>(".jr-media");
      const im = hb.querySelector<HTMLImageElement>(".jr-poster");
      if (fr)
        fr.style.clipPath = `inset(${top.toFixed(1)}px ${side.toFixed(1)}px ${bottom.toFixed(1)}px ${side.toFixed(1)}px round ${radius.toFixed(1)}px ${radius.toFixed(1)}px 26px 26px)`;
      // centre the doors (and the shop sign above them) inside the arch, as portalStyle does
      const cy = (top + (H - bottom)) / 2 - H / 2 + H * 0.27;
      if (md) md.style.transform = `translate3d(0,${cy.toFixed(1)}px,0)`;
      if (im && !im.getAttribute("src")) im.src = frameUrl("w1", true, 0);
    };
    syncHero();

    // One walk player per walk section (each loads only its own walk).
    const players = new Map<Segment, WalkPlayer>();
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-walk]").forEach((cv) => {
      const seg = cv.dataset["walk"] as Segment;
      // landscape phones get the landscape frames (portrait ones would be upscaled)
      const p = new WalkPlayer(cv, false, window.matchMedia("(orientation: portrait)").matches);
      p.resize();
      p.set(seg, played.has(seg) || reduce ? 1 : 0);
      players.set(seg, p);
    });
    const load = (seg: Segment) => {
      players.get(seg)?.load(seg);
    };
    load("w1");

    // Snap points in scroller coordinates (hero + every unit), refreshed on resize.
    let tops: number[] = [];
    let heroTop = 0;
    const measure = () => {
      if (!scroller) return;
      const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
      heroTop = (hb?.getBoundingClientRect().top ?? 0) - base;
      tops = units.map((u) => u.getBoundingClientRect().top - base);
    };
    measure();
    const chapterOf = (i: number): Ch => (units[i]?.dataset["ch"] ?? "c1") as Ch;
    const ranges = CHAPTERS.map((c) => {
      const idx = units.map((u, i) => (u.dataset["ch"] === c.k ? i : -1)).filter((i) => i >= 0);
      return [idx[0] ?? 0, idx[idx.length - 1] ?? 0] as const;
    });

    // Walk playback when a walk section is reached (the front desk's walk-in is the intro).
    let walkRaf = 0;
    let walking: { seg: Segment; sec: HTMLElement } | null = null;
    const endWalk = () => {
      cancelAnimationFrame(walkRaf);
      if (!walking) return;
      players.get(walking.seg)?.set(walking.seg, 1);
      played.add(walking.seg);
      walking.sec.classList.remove("walking");
      walking.sec.classList.add("on");
      if (walking.seg === "w1") hb?.classList.add("done");
      walking = null;
    };
    const playWalk = (seg: Segment, sec: HTMLElement) => {
      const p = players.get(seg);
      if (!p || played.has(seg) || reduce) {
        p?.set(seg, 1);
        played.add(seg);
        sec.classList.add("on");
        if (seg === "w1") hb?.classList.add("done");
        return;
      }
      endWalk();
      walking = { seg, sec };
      sec.classList.add("walking");
      let t0 = 0;
      const tick = (now: number) => {
        if (!t0) t0 = now;
        const k = Math.min(1, (now - t0) / WALK_MS);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        p.set(seg, e);
        if (k < 1) walkRaf = requestAnimationFrame(tick);
        else endWalk();
      };
      // wait for half the frames (≤ 2.5 s), then play eased
      const wait0 = performance.now();
      const ready = () => {
        if (walking?.seg !== seg) return;
        if (p.loaded(seg) >= 0.5 || performance.now() - wait0 > 2500)
          walkRaf = requestAnimationFrame(tick);
        else window.setTimeout(ready, 60);
      };
      ready();
    };

    // The unit crossing the middle of the screen is the current one.
    let cur = -1;
    const enter = (i: number) => {
      if (i === cur) return;
      if (walking && units[cur] === walking.sec) endWalk();
      cur = i;
      setUnit(i);
      const u = units[i];
      if (!u) return;
      const sec = u.dataset["sec"] ?? "";
      const seg = WALK_OF[sec];
      if (seg) playWalk(seg, u);
      else u.classList.add("on");
      // preload the next walk one section early
      if (i >= 0) load("w2");
      if (i >= 2) load("w3");
      const ch = chapterOf(i);
      const ci = CHAPTERS.findIndex((c) => c.k === ch);
      segs.forEach((b, k) => {
        b.setAttribute("aria-current", k === ci ? "step" : "false");
      });
      if (nowName) nowName.textContent = t(CHAPTERS[ci]?.label ?? "flow.hud.c1");
      if (nowCount) nowCount.textContent = t("flow.hud.page", { n: i + 1, total: UNITS });
    };
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) enter(units.indexOf(e.target as HTMLElement));
        });
      },
      { root: scroller, rootMargin: "-50% 0px -50% 0px" },
    );
    units.forEach((u) => {
      io.observe(u);
    });

    // Chapter bar fill (continuous with scroll) + settle onto the nearest section after a fling that
    // stopped between two (proximity snapping; never while the visitor reads a tall section or is below
    // the story).
    let raf = 0;
    let idle = 0;
    let touching = false;
    const vh = () => scroller?.clientHeight ?? window.innerHeight;
    const paint = () => {
      raf = 0;
      if (!scroller) return;
      const y = scroller.scrollTop;
      ranges.forEach(([a, b], k) => {
        const f = fills[k];
        if (!f) return;
        const s0 = tops[a] ?? 0;
        const s1 = tops[b] ?? 0;
        const v = s1 > s0 ? (y - s0 + vh() * 0.5) / (s1 - s0 + vh()) : y >= s0 - vh() * 0.5 ? 1 : 0;
        f.style.transform = `scaleX(${Math.max(0, Math.min(1, v)).toFixed(3)})`;
      });
    };
    const settle = () => {
      if (!scroller || touching) return;
      const y = scroller.scrollTop;
      const h = vh();
      const points = [heroTop, ...tops];
      const last = tops[tops.length - 1] ?? 0;
      if (y < heroTop - 2 || y > last + 2) return;
      // inside a tall section (landscape / small phones): free reading
      const i = points.findIndex((p, k) => y >= p && y < (points[k + 1] ?? Infinity));
      const top = points[i] ?? 0;
      const next = points[i + 1] ?? top + h;
      if (next - top > h + 4 && y + h <= next + 2) return;
      const target = y - top < (next - top) / 2 ? top : next;
      if (Math.abs(target - y) > 3) scrollY(scroller, target, !reduce);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
      window.clearTimeout(idle);
      idle = window.setTimeout(settle, 160);
    };
    const onTs = () => {
      touching = true;
    };
    const onTe = () => {
      touching = false;
      window.clearTimeout(idle);
      idle = window.setTimeout(settle, 220);
    };
    const prevSnap = scroller?.style.scrollSnapType ?? "";
    if (scroller) {
      scroller.style.scrollSnapType = "y proximity";
      scroller.addEventListener("scroll", onScroll, { passive: true });
      scroller.addEventListener("touchstart", onTs, { passive: true });
      scroller.addEventListener("touchend", onTe, { passive: true });
      scroller.addEventListener("touchcancel", onTe, { passive: true });
    }
    const onResize = () => {
      syncHero();
      players.forEach((p) => {
        p.resize();
      });
      measure();
      paint();
    };
    window.addEventListener("resize", onResize);
    void document.fonts.ready.then(onResize);
    paint();

    goRef.current = (i: number) => {
      if (!scroller) return;
      measure();
      scrollY(scroller, tops[i] ?? 0, !reduce);
    };
    if (__DEV__)
      (window as unknown as { __mj?: unknown }).__mj = {
        go: goRef.current,
        units: () => units.length,
      };

    return () => {
      io.disconnect();
      endWalk();
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
      window.removeEventListener("resize", onResize);
      if (scroller) {
        scroller.style.scrollSnapType = prevSnap;
        scroller.removeEventListener("scroll", onScroll);
        scroller.removeEventListener("touchstart", onTs);
        scroller.removeEventListener("touchend", onTe);
        scroller.removeEventListener("touchcancel", onTe);
      }
      players.forEach((p) => {
        p.destroy();
      });
    };
  }, [locale, reduce, t]);

  const go = (i: number) => {
    goRef.current(i);
  };
  const sh = (k: string) => t(k);
  const clientStep = Math.max(0, Math.min(CLIENT_STEPS.length - 1, unit - CLIENT0));
  const aiStep = Math.max(0, Math.min(AI_STEPS.length - 1, unit - AI0));
  // the handwritten price list, first lines, dots squeezed for the narrow note
  const swList = t("flow.switch.list")
    .split("\n")
    .slice(0, 4)
    .map((l) => l.replace(/\s*\.{2,}\s*/, " "));

  return (
    <div className="mj" ref={root}>
      <style>{MOBILE_CSS}</style>
      <StaticHero
        nav={nav}
        desktop={false}
        width={width}
        heroRef={heroBlock}
        onStart={() => {
          go(0);
        }}
      />
      <div className="mj-track">
        <div className="mj-barwrap">
          <nav className="mj-bar" aria-label={t("flow.hud.label")}>
            <div className="mj-segs">
              {CHAPTERS.map((c, k) => (
                <button
                  key={c.k}
                  type="button"
                  className="mj-seg"
                  aria-label={t(c.label)}
                  aria-current={k === 0 ? "step" : "false"}
                  onClick={() => {
                    const first = [0, 2, 6, 11, CLIENT0, AI0][k] ?? 0;
                    go(first);
                  }}
                >
                  <i>
                    <b />
                  </i>
                </button>
              ))}
            </div>
            <div className="mj-now" aria-hidden>
              <span>{t("flow.hud.c1")}</span>
              <small>{t("flow.hud.page", { n: 1, total: UNITS })}</small>
            </div>
          </nav>
        </div>

        {/* 1 · front desk, before (the walk-in plays here once: the intro) */}
        <section className="mj-s mj-u" data-ch="c1" data-sec="desk" aria-labelledby="mj-h-desk">
          <div className="mj-bg">
            <canvas data-walk="w1" aria-hidden />
          </div>
          <div className="mj-scrim" />
          <Card
            head={
              <>
                <span className="mj-tag b">{t("flow.pain.before")}</span>
                <div className="mj-eye">{t("flow.pain.eyebrow")}</div>
                <h2 className="mj-h" id="mj-h-desk">
                  {t("flow.pain.title")}
                </h2>
              </>
            }
          >
            <div className="mj-stat">
              <b>
                {t("flow.pain.statNum")}
                <small>{t("flow.pain.statUnit")}</small>
              </b>
              <span>
                <em>{t("flow.pain.pre")}</em>
                {t("flow.pain.statLabel")}
              </span>
            </div>
            <div className="mj-ping" aria-hidden>
              <span className="z">{Z}</span>
              <span className="n">
                {NOTES.slice(0, 2).map((k) => (
                  <span key={k}>
                    <small>
                      {t("flow.pain.zalo")}
                      {SEP}
                      {t("flow.pain.now")}
                    </small>
                    {t(`flow.pain.${k}`)}
                  </span>
                ))}
              </span>
              <span className="c">{String(BEFORE.length * 3)}</span>
            </div>
            <button
              type="button"
              className="mj-go"
              onClick={() => {
                go(1);
              }}
            >
              {t("flow.hud.after")}
              <i aria-hidden>{ARROW_D}</i>
            </button>
          </Card>
        </section>

        {/* 2 · the same desk, after (wipe reveal on arrival) */}
        <section className="mj-s mj-u" data-ch="c1" data-sec="after" aria-labelledby="mj-h-after">
          <div className="mj-bg">
            <Still k="stress" />
            <Still k="calm" className="mj-after-img" />
            <span className="mj-edge" aria-hidden />
          </div>
          <div className="mj-scrim" />
          <div className="mj-toast later" role="status">
            <i aria-hidden>{CHECK}</i>
            <span>
              <small>{t("flow.pain.zalo")}</small>
              {t("flow.ba.booked")}
            </span>
          </div>
          <Card
            head={
              <>
                <span className="mj-tag a">{t("flow.pain.after")}</span>
                <div className="mj-eye">{t("flow.pain.calmEyebrow")}</div>
                <h2 className="mj-h" id="mj-h-after">
                  {t("flow.pain.calmTitle")}
                </h2>
              </>
            }
          >
            <p className="mj-p">{t("flow.pain.calmSub")}</p>
            <div className="mj-gains">
              {GAINS.map((k) => (
                <div key={k} className="mj-gain">
                  <b>{t(`flow.pain.${k}n`)}</b>
                  <span>{t(`flow.pain.${k}l`)}</span>
                </div>
              ))}
            </div>
            <p className="mj-small">{t("flow.pain.src")}</p>
          </Card>
        </section>

        {/* 3 · treatment room (walk 2) */}
        <section className="mj-s mj-u" data-ch="c2" data-sec="treat" aria-labelledby="mj-h-treat">
          <div className="mj-bg">
            <canvas data-walk="w2" aria-hidden />
          </div>
          <div className="mj-scrim" />
          <Card
            head={
              <>
                <div className="mj-eye">{t("flow.features.eyebrow")}</div>
                <h2 className="mj-h" id="mj-h-treat">
                  {t("flow.features.title")}
                </h2>
              </>
            }
          >
            <p className="mj-p">{t("flow.features.facts")}</p>
          </Card>
        </section>

        {/* 4–6 · the three facts, each with one real screen */}
        {FACTS.map((f) => (
          <section
            key={f.k}
            className="mj-s mj-u plain"
            data-ch="c2"
            data-sec={f.k}
            aria-labelledby={`mj-h-${f.k}`}
          >
            <div className="mj-bg">
              <Still k="treat" />
            </div>
            <div className="mj-veil" />
            <MShot
              name={f.shot}
              name2x={f.shot2x}
              caption={sh(`flow.features.${f.label}`)}
              call={sh(`flow.features.${f.call}`)}
              reduce={reduce}
              h="36svh"
            />
            <Card
              foldable={false}
              head={
                <>
                  <div className="mj-n mj-in">{t(`flow.features.${f.k}n`)}</div>
                  <h3 className="mj-k mj-in" id={`mj-h-${f.k}`} style={{ ["--i" as string]: 1 }}>
                    {t(`flow.features.${f.k}k`)}
                  </h3>
                </>
              }
            >
              <p className="mj-p mj-in" style={{ ["--i" as string]: 2 }}>
                {t(`flow.features.${f.k}g`)}
              </p>
              <p className="mj-pain mj-in" style={{ ["--i" as string]: 3 }}>
                <i aria-hidden>{CROSS}</i>
                <span>
                  <em>{t("flow.features.today")}</em>
                  {t(`flow.features.${f.k}p`)}
                </span>
              </p>
            </Card>
          </section>
        ))}

        {/* 7 · back office (walk 3) */}
        <section className="mj-s mj-u" data-ch="c3" data-sec="office" aria-labelledby="mj-h-office">
          <div className="mj-bg">
            <canvas data-walk="w3" aria-hidden />
          </div>
          <div className="mj-scrim" />
          <Card
            head={
              <>
                <div className="mj-eye">{t("flow.office.eyebrow")}</div>
                <h2 className="mj-h" id="mj-h-office">
                  {t("flow.office.title")}
                </h2>
              </>
            }
          >
            <p className="mj-p">{t("flow.office.sub")}</p>
          </Card>
        </section>

        {/* 8 · this month (real overview card) */}
        <section
          className="mj-s mj-u plain"
          data-ch="c3"
          data-sec="month"
          aria-labelledby="mj-h-month"
        >
          <div className="mj-bg">
            <Still k="office" />
          </div>
          <div className="mj-veil" />
          <MShot
            name="mMonth"
            name2x="mMonth2x"
            caption={t("flow.m.monthShot")}
            reduce={reduce}
            h="44svh"
          />
          <Card
            foldable={false}
            head={
              <>
                <div className="mj-eye mj-in">{t("flow.office.eyebrow")}</div>
                <h2 className="mj-h mj-in" id="mj-h-month" style={{ ["--i" as string]: 1 }}>
                  {t("flow.m.monthH")}
                </h2>
              </>
            }
          >
            <p className="mj-p mj-in" style={{ ["--i" as string]: 2 }}>
              {t("flow.m.monthB")}
            </p>
          </Card>
        </section>

        {/* 9 · earnings estimate (big sliders) */}
        <section
          className="mj-s mj-u plain"
          data-ch="c3"
          data-sec="calc"
          aria-label={t("flow.calc.t")}
        >
          <div className="mj-bg">
            <Still k="office" />
          </div>
          <div className="mj-veil" />
          <div className="mj-in">
            <EarningsCard />
          </div>
        </section>

        {/* 10 · Insights */}
        <section className="mj-s mj-u plain" data-ch="c3" data-sec="ins" aria-labelledby="mj-h-ins">
          <div className="mj-bg">
            <Still k="office" />
          </div>
          <div className="mj-veil" />
          <MShot
            name="mInsights"
            name2x="mInsights2x"
            caption={t("flow.insights.shot")}
            reduce={reduce}
            h="34svh"
          />
          <Card
            foldable={false}
            head={
              <>
                <div className="mj-eye mj-in">{t("flow.insights.eyebrow")}</div>
                <h2 className="mj-h mj-in" id="mj-h-ins" style={{ ["--i" as string]: 1 }}>
                  {t("flow.insights.title")}
                </h2>
              </>
            }
          >
            <ul className="mj-list mj-in" style={{ ["--i" as string]: 2 }}>
              {INS.map((k) => (
                <li key={k}>
                  <i aria-hidden>{CHECK}</i>
                  {t(`flow.insights.${k}`)}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* 11 · payroll */}
        <section className="mj-s mj-u plain" data-ch="c3" data-sec="pay" aria-labelledby="mj-h-pay">
          <div className="mj-bg">
            <Still k="office" />
          </div>
          <div className="mj-veil" />
          <MShot
            name="mPayroll"
            name2x="mPayroll2x"
            caption={t("flow.payroll.shot")}
            reduce={reduce}
            h="32svh"
          />
          <Card
            foldable={false}
            head={
              <>
                <div className="mj-eye mj-in">{t("flow.payroll.eyebrow")}</div>
                <h2 className="mj-h mj-in" id="mj-h-pay" style={{ ["--i" as string]: 1 }}>
                  {t("flow.payroll.title")}
                </h2>
              </>
            }
          >
            <ul className="mj-list mj-in" style={{ ["--i" as string]: 2 }}>
              {PAY.map((k) => (
                <li key={k}>
                  <i aria-hidden>{CHECK}</i>
                  {t(`flow.payroll.${k}`)}
                </li>
              ))}
            </ul>
            <p className="mj-small">{t("flow.payroll.note")}</p>
          </Card>
        </section>

        {/* 12 · switching */}
        <section className="mj-s mj-u plain" data-ch="c4" data-sec="sw" aria-labelledby="mj-h-sw">
          <div className="mj-bg">
            <Still k="office" />
          </div>
          <div className="mj-veil" />
          <Card
            foldable={false}
            head={
              <>
                <div className="mj-eye">{t("flow.switch.eyebrow")}</div>
                <h2 className="mj-h" id="mj-h-sw">
                  {t("flow.m.swTitle")}
                </h2>
              </>
            }
          >
            <div className="mj-sw" aria-hidden>
              <div className="paper">
                {swList.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
              <div className="arr">
                <b>{ARROW_D}</b>
                {t("flow.switch.ai")}
              </div>
              <div className="svc">
                {SW_ROWS.map((r, i) => (
                  <div key={r} className="row" style={{ ["--i" as string]: i }}>
                    <b>{t(`flow.switch.n${r}`)}</b>
                    <em>{t(`flow.switch.p${r}`)}</em>
                  </div>
                ))}
              </div>
              <span className="done">{t("flow.switch.done")}</span>
            </div>
            <ol className="mj-steps">
              {SW_STEPS.map((k, i) => (
                <li key={k}>
                  <b>{String(i + 1)}</b>
                  <span>{t(`flow.switch.${k}`)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        {/* 13 · the client's perspective (Zalo chat, one snap per step) */}
        <section
          className="mc-track mc-client"
          style={{ height: `${String(CLIENT_STEPS.length * 100)}svh` }}
        >
          {CLIENT_STEPS.map((s, i) => (
            <span
              key={s.k}
              className="mc-mk mj-u"
              data-ch="client"
              style={{ top: `${String(i * 100)}svh` }}
              aria-hidden
            />
          ))}
          <MobileChat
            ns="views.client"
            kind="client"
            steps={CLIENT_STEPS}
            step={clientStep}
            live={unit >= CLIENT0 && unit < AI0}
            reduce={reduce}
            chapterId="mj-h-client"
          />
        </section>

        {/* 14 · the AI assistant (Pro) */}
        <section
          className="mc-track mc-ai"
          style={{ height: `${String(AI_STEPS.length * 100)}svh` }}
        >
          {AI_STEPS.map((s, i) => (
            <span
              key={s.k}
              className="mc-mk mj-u"
              data-ch="ai"
              style={{ top: `${String(i * 100)}svh` }}
              aria-hidden
            />
          ))}
          <MobileChat
            ns="views.ai"
            kind="ai"
            steps={AI_STEPS}
            step={aiStep}
            live={unit >= AI0}
            reduce={reduce}
            viz={(k) => <AiViz k={k} />}
            chapterId="mj-h-ai"
          />
        </section>
      </div>
    </div>
  );
}
