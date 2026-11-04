import { useLayoutEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, screenSize, type ScreenName } from "../screens";
import type { LandingNavActions } from "../useLandingNav";
import { MobileChat } from "./MobileChat";
import { MOBILE_CSS, QA_CSS, SW_ROWS, WALK_MS } from "./mobile.css";
import { AI_STEPS, AiViz, CLIENT_STEPS } from "./Perspectives";
import { EarningsCard } from "./Rooms";
import { WalkPlayer, frameUrl, type Segment } from "./sequence";
import { StaticHero } from "./StaticHero";
import { CUTS } from "./cuts";
import { scrollParent } from "./timelines";
import { openZoom } from "./zoom";

const CHECK = "✓";
const CROSS = "✕";
const PIN = "●";
const Z = "Z";
const SEP = " · ";
const ARROW_R = "→";
const SPARK = "✦";
const CENTER = "\u2195";
const NOTES = ["n1", "n2", "n3", "n4"] as const;
const BEFORE = ["b1", "b2", "b3", "b4"] as const;
const GAINS = ["g1", "g2", "g3"] as const;
const INS = ["i1", "i3", "i5"] as const;
const PAY = ["p1", "p3", "p5"] as const;
const SW_STEPS = ["st1", "st2", "st3", "st4"] as const;

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

/** Chapters of the chapter bar → the story pages they cover (DOM order of `.mj-u`). */
const CHAPTERS = [
  { k: "c1", label: "flow.hud.c1" },
  { k: "c2", label: "flow.hud.c2" },
  { k: "c3", label: "flow.hud.c3" },
  { k: "c4", label: "flow.hud.c4" },
  { k: "client", label: "views.tab.client" },
  { k: "ai", label: "views.tab.ai" },
] as const;
type Ch = (typeof CHAPTERS)[number]["k"];

/** Salon pages in order; client + AI chats follow (one page per step). */
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
/** Story chrome (chapter bar, center pill) shows only while at least this share of the story is in view. */
const CHROME_MIN = 0.3;

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
 * One real CRM crop taken at a phone viewport (scripts/landing-screens.mjs `m-*`), shown at about 1:1
 * and cut on a whole row; a tap on it (or its Zoom pill) opens the zoom viewer (pinch / double-tap).
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
  const box = useRef<HTMLSpanElement>(null);
  // The crop ends on a whole row (CUTS): the tallest row boundary that fits max(300 px, h svh).
  useLayoutEffect(() => {
    const el = box.current;
    const cuts = CUTS[locale][name];
    if (!el) return;
    let lastW = -1;
    const fit = () => {
      // react to width changes only (setting max-height must not re-trigger the observer)
      if (el.clientWidth === lastW) return;
      lastW = el.clientWidth;
      const natural = (el.clientWidth * ph) / w;
      const svh = h ? Number.parseFloat(h) : 44;
      const max = Math.max(300, (window.innerHeight * svh) / 100);
      if (natural <= max) {
        el.style.maxHeight = "none";
        return;
      }
      const end = [...(cuts ?? [])].reverse().find((c) => c * natural <= max);
      el.style.maxHeight = `${String(Math.round(end ? end * natural : max))}px`;
      el.classList.toggle("row", end !== undefined);
    };
    fit();
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [locale, name, ph, w, h]);
  // A tap on the picture opens the zoom viewer (as its Zoom pill does); pages turn from the text.
  return (
    <figure className="mj-shot mj-in" style={h ? { ["--shot-h" as string]: h } : undefined}>
      <figcaption className="cap">
        <span>{caption}</span>
      </figcaption>
      <span className="img" ref={box}>
        <img
          src={src}
          srcSet={srcSet}
          sizes="(orientation: landscape) 48vw, calc(100vw - 52px)"
          width={w}
          height={ph}
          alt={caption}
          decoding="async"
          loading="lazy"
        />
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
      <div className="mj-body">
        {head}
        <div className="mj-more">{children}</div>
      </div>
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
    </div>
  );
}

/** Front desk "before": its glass card (page 1, and the scene under the full-screen wipe on page 2). */
function DeskBefore({ onAfter, replica = false }: { onAfter: () => void; replica?: boolean }) {
  const { t } = useTranslation("landing");
  return (
    <Card
      head={
        <>
          <span className="mj-tag b">{t("flow.pain.before")}</span>
          <div className="mj-eye">{t("flow.pain.eyebrow")}</div>
          <h2 className="mj-h" id={replica ? undefined : "mj-h-desk"}>
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
          {NOTES.map((k) => (
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
      <button type="button" className="mj-go" onClick={onAfter} tabIndex={replica ? -1 : undefined}>
        {t("flow.hud.after")}
        <i aria-hidden>{ARROW_R}</i>
      </button>
    </Card>
  );
}

/**
 * The story on phones (≤ 899 px; ADR-0014 "Mobile") as Instagram-style stories: only the current page
 * is in the layout; tap right = next, tap left = back (also swipe, ← / →); vertical scrolling is ordinary
 * page scrolling. Pages: front desk (the walk-in plays once as the intro), the before → after reveal, the
 * treatment room and its three facts, the office (overview, earnings, Insights, payroll), switching, then
 * the client's and the AI's chats, one page per step. A sticky chapter bar fills page by page; a tap on a
 * chapter opens it. Desktop never renders this.
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
  /** first-view tap hint: shown when the story first appears, gone after the first page turn */
  const [hint, setHint] = useState<"off" | "on" | "done">("off");
  const goRef = useRef<(i: number) => void>(() => undefined);
  /** first page of each chapter (from the DOM, set by the controller) */
  const firstOf = useRef<number[]>([]);
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
    const bar = el.querySelector<HTMLElement>(".mj-bar");

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
        placeCenter();
        if (vis && !shown) {
          shown = true;
          show(cur, false);
          setHint((h) => (h === "off" ? "on" : h));
        }
      },
      { root: scroller, threshold: 0.55 },
    );
    if (track) io.observe(track);

    // Next / back. Past the last page the story ends: scroll on to the free-year band; before the first,
    // back up to the hero.
    // Keyboard / screen-reader turns move focus to the new page's heading (taps do not).
    const focusHeading = () => {
      const u = els[cur];
      const h = u?.querySelector<HTMLElement>("h2,h3,[id^='mj-h-']");
      if (h) {
        h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
      }
    };
    const step = (d: 1 | -1, viaKeys = false) => {
      shown = true;
      setHint("done");
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
      if (viaKeys) focusHeading();
    };
    stepRef.current = (d: 1 | -1) => {
      step(d, true);
    };
    // Tap zones: left third = back, the rest = next (as Instagram stories). Controls inside the page
    // (buttons, links, sliders, the earnings card, the chapter bar) keep their own taps; a chat's quick
    // replies always mean "next"; a scroll never counts as a tap.
    // The earnings card is NOT a control: only a slider's own box (its thumb and track hit area) is;
    // a tap anywhere else on the card turns the page like everywhere else.
    const INTERACTIVE = "button,a,input,select,textarea,label:not(.calc-r),[data-notap],.mj-zoom";
    const fx = el.querySelector<HTMLElement>(".mj-tapfx");
    /** A slider's box plus 8 px: near-misses on a slider never turn the page. */
    const nearSlider = (x: number, y: number) =>
      Array.from(el.querySelectorAll<HTMLElement>(".mj-u.cur .calc-sl")).some((s) => {
        const r = s.getBoundingClientRect();
        return x > r.left - 8 && x < r.right + 8 && y > r.top - 8 && y < r.bottom + 8;
      });
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest(INTERACTIVE) || nearSlider(e.clientX, e.clientY)) return;
      // a tap on a screenshot opens it in the zoom viewer
      const pic = target.closest(".mj-shot .img");
      if (pic) {
        pic.querySelector<HTMLButtonElement>(".mj-zbtn2")?.click();
        return;
      }
      const back = !target.closest("[data-advance]") && e.clientX < window.innerWidth / 3;
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
      if (target?.closest(INTERACTIVE) || nearSlider(sx, sy)) return;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
    };
    // ← / → while the story is on screen
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tg?.tagName ?? "") || e.altKey || e.metaKey || e.ctrlKey)
        return;
      if (!track || document.querySelector(".mj-zoom")) return;
      const r = track.getBoundingClientRect();
      if (r.bottom < vh() * 0.4 || r.top > vh() * 0.6) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1, true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1, true);
      }
    };
    track?.addEventListener("click", onClick);
    track?.addEventListener("touchstart", onTs, { passive: true });
    track?.addEventListener("touchend", onTe, { passive: true });
    window.addEventListener("keydown", onKey);

    // "Center view" (as desktop): while the story is partly out of the viewport, a glass pill in the
    // thumb zone smoothly scrolls it back to fill the screen. It moves up until nothing readable or
    // tappable is under it (never covers content) and hides while the zoom viewer is open.
    const centerBtn = document.createElement("button");
    centerBtn.type = "button";
    centerBtn.className = "mj-center";
    centerBtn.hidden = true;
    const centerIcon = document.createElement("i");
    centerIcon.setAttribute("aria-hidden", "true");
    centerIcon.textContent = CENTER;
    centerBtn.append(centerIcon, document.createTextNode(t("flow.hud.center")));
    centerBtn.addEventListener("click", () => {
      if (!scroller || !track) return;
      const r = track.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      const H = vh();
      // story below → its top to the top; story above → its bottom to the bottom (fills the screen)
      const d = r.top - sr.top > 0 || r.height <= H ? r.top - sr.top : r.bottom - sr.top - H;
      scrollY(scroller, scroller.scrollTop + d, !reduce);
    });
    // on <body>, as desktop: above every stacking context of the page
    document.body.append(centerBtn);
    /**
     * Boxes of what a visitor reads or taps: a known list (the current story page's text, controls and
     * pictures, the hero copy, the free-year band and pricing), measured once per settled scroll. A
     * box still revealing (`.rv` not yet in) is widened by its 40 px travel.
     */
    const CONTENT = [
      ".mj-u.cur :is(h1,h2,h3,p,li,button,a,img,.mj-tag,.mj-eye,.mj-stat,.mj-ping,.mj-gain,.mj-toast,.calc-sl,.calc-out,.calc-year,.mc-msg,.mc-input)",
      ".mj-bar",
      ".jr-static :is(h1,p,button,a,.jr-plaque)",
      "#fl-free :is(.fl-eye,h2,p,button)",
      "[data-testid='pricing-section'] :is([dir='auto'],[role='button'],[role='radio'])",
    ].join(",");
    const contentBoxes = () => {
      const H = window.innerHeight;
      const boxes: DOMRect[] = [];
      document.querySelectorAll<HTMLElement>(CONTENT).forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.bottom < 0 || r.top > H) return;
        const moving = e.closest(".rv:not(.in)") ? 40 : 0;
        boxes.push(new DOMRect(r.left, r.top - moving, r.width, r.height + 2 * moving));
      });
      return boxes;
    };
    let centerRaf = 0;
    let settle = 0;
    const placeCenter = () => {
      // re-check once scrolling and the reveal transitions underneath have settled
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        placeNow(true);
      }, 400);
      placeNow(false);
    };
    const placeNow = (search: boolean) => {
      cancelAnimationFrame(centerRaf);
      centerRaf = requestAnimationFrame(() => {
        if (!track || !scroller) return;
        const r = track.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        const H = vh();
        const visible = Math.max(0, Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top));
        // the story is "the main thing on screen" while ≥ 30 % of it (or of the screen) is in view;
        // below that its chrome (chapter bar, center pill) leaves, and comes back on the way in
        const main = visible >= Math.min(r.height, H) * CHROME_MIN;
        bar?.classList.toggle("off", !main);
        const show = shown && main && !document.querySelector(".mj-zoom") && visible < H * 0.97;
        if (!show) {
          centerBtn.hidden = true;
          return;
        }
        // while the page scrolls the pill steps aside; it comes back, placed clear of content, once the
        // scroll has settled
        if (!search) {
          centerBtn.hidden = true;
          return;
        }
        centerBtn.hidden = false;
        const { width, height } = centerBtn.getBoundingClientRect();
        const W = window.innerWidth;
        const boxes = contentBoxes();
        const gap = 6;
        const free = (bottom: number) => {
          const l = (W - width) / 2 - gap;
          const r = (W + width) / 2 + gap;
          const t = window.innerHeight - bottom - height - gap;
          const b = window.innerHeight - bottom + gap;
          return !boxes.some((x) => x.right > l && x.left < r && x.bottom > t && x.top < b);
        };
        const safe = 16;
        // the thumb zone first (bottom up to 45 % of the screen, 8 px steps); if it is all content,
        // the nearest free spot higher up; never on top of content
        let at = safe;
        while (at < H - 96 && !free(at)) at += 8;
        if (at >= H - 96) {
          centerBtn.hidden = true;
          return;
        }
        centerBtn.style.bottom = `calc(${String(at)}px + env(safe-area-inset-bottom, 0px))`;
      });
    };
    scroller?.addEventListener("scroll", placeCenter, { passive: true });

    const onResize = () => {
      placeCenter();
      syncHero();
      players.forEach((p) => {
        p.resize();
      });
    };
    window.addEventListener("resize", onResize);
    void document.fonts.ready.then(onResize);

    firstOf.current = ranges.map(([a]) => a);
    goRef.current = (i: number) => {
      shown = true;
      show(i, true);
      if (scroller) scrollY(scroller, trackTop(), false);
    };
    startRef.current = () => {
      if (scroller) scrollY(scroller, trackTop(), !reduce);
    };
    let devGo = 0;
    if (__DEV__) {
      (window as unknown as { __mj?: unknown }).__mj = {
        go: goRef.current,
        step,
        page: () => cur,
        units: () => els.length,
      };
      // ?mj=<page> opens that page and ?mjqa=notext,noglass strips text / glass (QA on the iOS
      // Simulator, where no script drives Safari: blur and contrast are measured from screenshots)
      const qs = new URLSearchParams(window.location.search);
      const q = qs.get("mj");
      for (const f of (qs.get("mjqa") ?? "").split(",").filter(Boolean))
        el.classList.add(`qa-${f}`);
      if (q !== null)
        devGo = window.setTimeout(() => {
          goRef.current(Number(q));
        }, 1500);
    }

    return () => {
      window.clearTimeout(devGo);
      io.disconnect();
      endWalk();
      cancelAnimationFrame(centerRaf);
      window.clearTimeout(settle);
      scroller?.removeEventListener("scroll", placeCenter);
      centerBtn.remove();
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
      {__DEV__ ? <style>{QA_CSS}</style> : null}
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
          <nav className="mj-bar" aria-label={t("flow.hud.label")} data-notap>
            <div className="mj-segs">
              {CHAPTERS.map((c, k) => (
                <button
                  key={c.k}
                  type="button"
                  className="mj-seg"
                  aria-label={t(c.label)}
                  aria-current={k === 0 ? "step" : "false"}
                  onClick={() => {
                    go(firstOf.current[k] ?? 0);
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
        {hint === "on" ? (
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
          <DeskBefore
            onAfter={() => {
              stepBy(1);
            }}
          />
        </section>

        {/* 2 · the same desk, after: the WHOLE screen (photo, copy, pings, gains) wipes from the
            "before" scene to the "after" scene, as on desktop */}
        <section
          className="mj-s mj-u ba"
          data-ch="c1"
          data-sec="after"
          aria-labelledby="mj-h-after"
        >
          <div className="mj-scene b" aria-hidden inert>
            <div className="mj-bg">
              <Still k="stress" />
            </div>
            <DeskBefore onAfter={() => undefined} replica />
          </div>
          <div className="mj-scene a">
            <div className="mj-bg">
              <Still k="calm" />
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
              <div className="mj-toast later" role="status">
                <i aria-hidden>{CHECK}</i>
                <span>
                  <small>{t("flow.pain.zalo")}</small>
                  {t("flow.ba.booked")}
                </span>
              </div>
            </Card>
          </div>
          <span className="mj-edge" aria-hidden />
        </section>

        {/* 3 · treatment room (walk 2) */}
        <section className="mj-s mj-u" data-ch="c2" data-sec="treat" aria-labelledby="mj-h-treat">
          <div className="mj-bg">
            <canvas data-walk="w2" aria-hidden />
          </div>
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
              <MShot
                name={f.shot}
                name2x={f.shot2x}
                caption={sh(`flow.features.${f.label}`)}
                call={sh(`flow.features.${f.call}`)}
                reduce={reduce}
                h="42svh"
              />
            </Card>
          </section>
        ))}

        {/* 7 · back office (walk 3) */}
        <section className="mj-s mj-u" data-ch="c3" data-sec="office" aria-labelledby="mj-h-office">
          <div className="mj-bg">
            <canvas data-walk="w3" aria-hidden />
          </div>
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
            <MShot
              name="mMonth"
              name2x="mMonth2x"
              caption={t("flow.m.monthShot")}
              reduce={reduce}
              h="44svh"
            />
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
          <Card foldable={false} head={null}>
            <div className="mj-in">
              <EarningsCard mobile />
            </div>
          </Card>
        </section>

        {/* 10 · Insights */}
        <section className="mj-s mj-u plain" data-ch="c3" data-sec="ins" aria-labelledby="mj-h-ins">
          <div className="mj-bg">
            <Still k="office" />
          </div>
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
            <MShot
              name="mInsights"
              name2x="mInsights2x"
              caption={t("flow.insights.shot")}
              reduce={reduce}
              h="40svh"
            />
          </Card>
        </section>

        {/* 11 · payroll */}
        <section className="mj-s mj-u plain" data-ch="c3" data-sec="pay" aria-labelledby="mj-h-pay">
          <div className="mj-bg">
            <Still k="office" />
          </div>
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
            <MShot
              name="mPayroll"
              name2x="mPayroll2x"
              caption={t("flow.payroll.shot")}
              reduce={reduce}
              h="44svh"
            />
          </Card>
        </section>

        {/* 12 · switching */}
        <section className="mj-s mj-u plain" data-ch="c4" data-sec="sw" aria-labelledby="mj-h-sw">
          <div className="mj-bg">
            <Still k="office" />
          </div>
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
            {/* AI setup, told on the phone: the handwritten price list, a scan sweep, then the
                services fill in row by row (name, duration, price, switched on). Plays each time the
                page opens (`.on`); reduced motion shows the finished list. Decorative: the steps
                below carry the meaning. */}
            <div className="mj-sw" aria-hidden>
              <div className="ai">
                <i>{SPARK}</i>
                <b>{t("flow.switch.ai")}</b>
                <span className="st">
                  <span className="s1">{t("flow.switch.reading")}</span>
                  <span className="s2">{t("flow.switch.done")}</span>
                </span>
                <span className="prog">
                  <span />
                </span>
              </div>
              <div className="stage">
                <div className="paper">
                  <em>{t("flow.switch.from")}</em>
                  {swList.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                  <span className="scan" />
                </div>
                <div className="win">
                  <span className="wh">{t("flow.switch.win")}</span>
                  {SW_ROWS.map((r, i) => (
                    <div key={r} className="row" style={{ ["--i" as string]: i }}>
                      <span className="sk">
                        <span />
                        <span />
                      </span>
                      <span className="val">
                        <span className="nm">
                          <b>{t(`flow.switch.n${r}`)}</b>
                          <small>{t(`flow.switch.d${r}`)}</small>
                        </span>
                        <em>{t(`flow.switch.p${r}`)}</em>
                        <span className="tog">
                          <i />
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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

        {/* 13 · the client's perspective (Zalo chat, one page per step) */}
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
