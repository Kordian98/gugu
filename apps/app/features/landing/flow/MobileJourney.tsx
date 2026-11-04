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
  domScrollTo.call(sc, { top: Math.round(top), behavior: smooth ? "smooth" : "auto" });
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
  // In a story every tap on the picture turns the page; the zoom is its own button in the caption.
  return (
    <figure className="mj-shot mj-in" style={h ? { ["--shot-h" as string]: h } : undefined}>
      <figcaption className="cap">
        <span>{caption}</span>
        <button
          type="button"
          className="mj-zbtn2"
          aria-label={`${t("flow.m.zoom")}: ${caption}`}
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
          <i aria-hidden />
          {t("flow.m.zoom")}
        </button>
      </figcaption>
      <span className="img">
        <img
          src={src}
          srcSet={srcSet}
          sizes="(orientation: landscape) 48vw, calc(100vw - 32px)"
          width={w}
          height={ph}
          alt={caption}
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
    </figure>
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
  const [page, setPage] = useState(0);
  const [live, setLive] = useState(false);
  const goRef = useRef<(i: number) => void>(() => undefined);
  const stepRef = useRef<(d: 1 | -1) => void>(() => undefined);
  const startRef = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    const el = root.current;
    const hb = heroBlock.current;
    if (!el) return;
    const sc = scrollParent(el);
    const scroller = sc instanceof HTMLElement ? sc : null;
    const track = el.querySelector<HTMLElement>(".mj-track");
    // page → its element (a chat is one element for all of its steps)
    const els: HTMLElement[] = [];
    el.querySelectorAll<HTMLElement>(".mj-u").forEach((u) => {
      const n = Number(u.dataset["n"] ?? "1");
      for (let k = 0; k < n; k++) els.push(u);
    });
    const fills = Array.from(el.querySelectorAll<HTMLElement>(".mj-seg b"));
    const nowName = el.querySelector<HTMLElement>(".mj-now span");
    const nowCount = el.querySelector<HTMLElement>(".mj-now small");
    const segs = Array.from(el.querySelectorAll<HTMLButtonElement>(".mj-seg"));
    const sr = el.querySelector<HTMLElement>(".mj-sr");

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

    // One walk player per walk page (each loads only its own walk).
    const players = new Map<Segment, WalkPlayer>();
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-walk]").forEach((cv) => {
      const seg = cv.dataset["walk"] as Segment;
      // landscape phones get the landscape frames (portrait ones would be upscaled)
      const p = new WalkPlayer(cv, false, window.matchMedia("(orientation: portrait)").matches);
      players.set(seg, p);
    });
    const load = (seg: Segment) => {
      players.get(seg)?.load(seg);
    };
    load("w1");

    const chapterOf = (i: number): Ch => (els[i]?.dataset["ch"] ?? "c1") as Ch;
    const ranges = CHAPTERS.map((c) => {
      const idx = els.map((u, i) => (u.dataset["ch"] === c.k ? i : -1)).filter((i) => i >= 0);
      return [idx[0] ?? 0, idx[idx.length - 1] ?? 0] as const;
    });

    // Walk playback when a walk page is shown (the front desk's walk-in is the intro, once).
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
      p?.resize();
      if (!p || played.has(seg) || reduce) {
        p?.set(seg, 1);
        played.add(seg);
        sec.classList.add("on");
        if (seg === "w1") hb?.classList.add("done");
        return;
      }
      p.set(seg, 0);
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

    const vh = () => scroller?.clientHeight ?? window.innerHeight;
    const trackTop = () =>
      scroller && track
        ? track.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
        : 0;
    // Show page i (Instagram stories): only that page is in the layout; a long page simply scrolls.
    let cur = -1;
    let shown = false;
    const show = (i: number, fromTap: boolean) => {
      const n = Math.max(0, Math.min(els.length - 1, i));
      const prevEl = els[cur];
      const u = els[n];
      if (!u) return;
      if (walking && prevEl === walking.sec && prevEl !== u) endWalk();
      if (prevEl && prevEl !== u) {
        prevEl.classList.remove("cur", "on");
      }
      cur = n;
      setPage(n);
      u.classList.add("cur");
      // a new page starts at its top (only if the visitor had scrolled inside the previous one)
      if (fromTap && scroller) {
        const top = trackTop();
        if (Math.abs(scroller.scrollTop - top) > 2 && scroller.scrollTop > top - vh() * 0.5)
          scrollY(scroller, top, false);
      }
      const seg = WALK_OF[u.dataset["sec"] ?? ""];
      if (seg && shown) playWalk(seg, u);
      else if (shown)
        requestAnimationFrame(() => {
          u.classList.add("on");
        });
      // preload the next walks a page or two early
      if (n >= 0) load("w2");
      if (n >= 2) load("w3");
      const ci = CHAPTERS.findIndex((c) => c.k === chapterOf(n));
      segs.forEach((b, k) => {
        b.setAttribute("aria-current", k === ci ? "step" : "false");
      });
      ranges.forEach(([a, b], k) => {
        const f = fills[k];
        if (f)
          f.style.transform = `scaleX(${(n > b ? 1 : n < a ? 0 : (n - a + 1) / (b - a + 1)).toFixed(3)})`;
      });
      if (nowName) nowName.textContent = t(CHAPTERS[ci]?.label ?? "flow.hud.c1");
      if (nowCount) nowCount.textContent = t("flow.hud.page", { n: n + 1, total: UNITS });
      if (sr && fromTap)
        sr.textContent = t("flow.hud.pageSr", {
          n: n + 1,
          total: UNITS,
          chapter: t(CHAPTERS[ci]?.label ?? "flow.hud.c1"),
        });
    };
    show(0, false);

    // The story becomes "live" (intro, typing) once it is on screen.
    const io = new IntersectionObserver(
      (es) => {
        const vis = es.some((e) => e.isIntersecting);
        setLive(vis);
        if (vis && !shown) {
          shown = true;
          show(cur, false);
        }
      },
      { root: scroller, threshold: 0.55 },
    );
    if (track) io.observe(track);

    // Next / back. Past the last page the story ends: scroll on to the free-year band; before the first,
    // back up to the hero.
    const step = (d: 1 | -1) => {
      shown = true;
      if (d > 0 && cur >= els.length - 1) {
        const f = document.getElementById("fl-free");
        if (scroller && f)
          scrollY(
            scroller,
            f.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop,
            !reduce,
          );
        return;
      }
      if (d < 0 && cur <= 0) {
        if (scroller) scrollY(scroller, 0, !reduce);
        return;
      }
      show(cur + d, true);
    };
    stepRef.current = step;
    // Tap zones: left third = back, the rest = next (as Instagram stories). Controls inside the page
    // (buttons, sliders, screenshots, links) keep their own taps; a scroll never counts as a tap.
    const INTERACTIVE = "button,a,input,label,select,textarea,.calc,[data-notap]";
    const fx = el.querySelector<HTMLElement>(".mj-tapfx");
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest(INTERACTIVE)) return;
      const back = e.clientX < window.innerWidth / 3;
      if (fx && !reduce) {
        fx.className = `mj-tapfx ${back ? "l" : "r"}`;
        fx.getBoundingClientRect(); // restart the flash animation
        fx.classList.add("go");
      }
      step(back ? -1 : 1);
    };
    // a clear horizontal swipe also turns the page (← next, → back)
    let sx = 0;
    let sy = 0;
    const onTs = (e: TouchEvent) => {
      sx = e.touches[0]?.clientX ?? 0;
      sy = e.touches[0]?.clientY ?? 0;
    };
    const onTe = (e: TouchEvent) => {
      const t0 = e.changedTouches[0];
      if (!t0) return;
      const dx = t0.clientX - sx;
      const dy = t0.clientY - sy;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input,.mj-zoom")) return;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
    };
    // ← / → while the story is on screen
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tg?.tagName ?? "") || e.altKey || e.metaKey || e.ctrlKey)
        return;
      if (!track) return;
      const r = track.getBoundingClientRect();
      if (r.bottom < vh() * 0.4 || r.top > vh() * 0.6) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    };
    track?.addEventListener("click", onClick);
    track?.addEventListener("touchstart", onTs, { passive: true });
    track?.addEventListener("touchend", onTe, { passive: true });
    window.addEventListener("keydown", onKey);

    const onResize = () => {
      syncHero();
      players.forEach((p) => {
        p.resize();
      });
    };
    window.addEventListener("resize", onResize);
    void document.fonts.ready.then(onResize);

    goRef.current = (i: number) => {
      shown = true;
      show(i, true);
      if (scroller) scrollY(scroller, trackTop(), false);
    };
    startRef.current = () => {
      if (scroller) scrollY(scroller, trackTop(), !reduce);
    };
    if (__DEV__)
      (window as unknown as { __mj?: unknown }).__mj = {
        go: goRef.current,
        step,
        page: () => cur,
        units: () => els.length,
      };

    return () => {
      io.disconnect();
      endWalk();
      track?.removeEventListener("click", onClick);
      track?.removeEventListener("touchstart", onTs);
      track?.removeEventListener("touchend", onTe);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      players.forEach((p) => {
        p.destroy();
      });
    };
  }, [locale, reduce, t]);

  const go = (i: number) => {
    goRef.current(i);
  };
  const stepBy = (d: 1 | -1) => {
    stepRef.current(d);
  };
  const sh = (k: string) => t(k);
  const clientStep = Math.max(0, Math.min(CLIENT_STEPS.length - 1, page - CLIENT0));
  const aiStep = Math.max(0, Math.min(AI_STEPS.length - 1, page - AI0));
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
          startRef.current();
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
            {/* keyboard / screen reader: the tap zones as real buttons (visible on focus) */}
            <button
              type="button"
              className="mj-kb prev"
              onClick={() => {
                stepBy(-1);
              }}
            >
              {t("flow.hud.prev")}
            </button>
            <button
              type="button"
              className="mj-kb next"
              onClick={() => {
                stepBy(1);
              }}
            >
              {t("flow.hud.next")}
            </button>
            <span className="mj-sr" aria-live="polite" />
          </nav>
        </div>
        <span className="mj-tapfx" aria-hidden />
        {page === 0 && !played.has("w1") ? (
          <div className="mj-taphint" aria-hidden>
            <span>{t("flow.m.tapBack")}</span>
            <span>{t("flow.m.tapNext")}</span>
          </div>
        ) : null}

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
                stepBy(1);
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
          className="mc-track mc-client mj-u"
          data-ch="client"
          data-n={CLIENT_STEPS.length}
          aria-labelledby="mj-h-client"
        >
          <MobileChat
            ns="views.client"
            kind="client"
            steps={CLIENT_STEPS}
            step={clientStep}
            live={live && page >= CLIENT0 && page < AI0}
            reduce={reduce}
            chapterId="mj-h-client"
          />
        </section>

        {/* 14 · the AI assistant (Pro) */}
        <section
          className="mc-track mc-ai mj-u"
          data-ch="ai"
          data-n={AI_STEPS.length}
          aria-labelledby="mj-h-ai"
        >
          <MobileChat
            ns="views.ai"
            kind="ai"
            steps={AI_STEPS}
            step={aiStep}
            live={live && page >= AI0}
            reduce={reduce}
            viz={(k) => <AiViz k={k} />}
            chapterId="mj-h-ai"
          />
        </section>
      </div>
    </div>
  );
}
