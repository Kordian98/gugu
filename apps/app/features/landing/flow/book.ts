import { gsap } from "gsap";

/**
 * The story as a BOOK (web, owner 2026-11-04). Only the NAVIGATION is book-like; the animations (walk
 * frames, door portal, before → after sweep, reveals, counters) are the same timeline as before.
 *
 * Layout: a STATIC hero block (doors closed, journey time 0) sits above the story stage (one viewport).
 *
 * - Intro, once per visit: the first small scroll at the hero (≥ 6 % of the viewport of wheel, nudges add up, ≥ INTRO_TOUCH px
 *   of swipe, Start, a key, or arriving at the stage any other way) jumps invisibly from the static hero to
 *   the identical stage and plays the doors + walk-in to Front desk page 1 at its normal pace. Scroll and
 *   swipe input is ignored while it plays (no skip, no double trigger). Below the threshold nothing happens.
 * - After that, scrolling is plain page scrolling, never captured (owner revoked the dock capture,
 *   2026-11-04): up shows the static hero (no animation, nothing reverses), down passes the book (on the
 *   page the visitor left) and the sections below. While the journey is partly out of the viewport a
 *   "Center view" button smoothly re-docks it.
 * - Pages turn only by Next/Prev, HUD chapters, ← / → while the story is in view and one HORIZONTAL
 *   touch swipe per page. ↑ ↓ PgUp PgDn Space and vertical swipes scroll the page. Scroll, swipes, ← and chapters are ignored
 *   while the intro plays; Next / → / ↓ again speed it up. A turn plays the timeline from one composed page to
 *   the next at the original pacing and cannot stop half-way. Pressing Next / → again during a forward
 *   turn (or Prev / ← during a backward one) speeds it up early in the turn, or (in its second half, which already
 *   looks still) finishes it and turns one page on; the opposite direction reverses it. Page 1 has no Prev (nothing replays).
 * - Reduced motion: the intro and every turn are short crossfades.
 */

export type Page = {
  /** Journey time (timeline seconds) at which the page is fully composed. */
  t: number;
  /** Seconds the forward turn INTO this page plays (original pacing). */
  dur: number;
};

export type BookApi = {
  destroy: () => void;
  next: () => void;
  prev: () => void;
  /** Smooth jump to page i ≥ 1 (the chapter jump: duration grows with distance). */
  goTo: (i: number) => void;
  /** Smoothly scrolls to the first section after the story. */
  exit: () => void;
  /** Static hero "Start": plays the intro the first time, afterwards scrolls back to the book. */
  start: () => void;
  /** Smoothly scrolls the story back to exactly fill the viewport. */
  center: () => void;
  page: () => number;
  /** A turn or a programmatic scroll is running. */
  busy: () => boolean;
};

type Opts = {
  scroller: HTMLElement;
  /** The static hero block above the stage. */
  hero: HTMLElement;
  track: HTMLElement;
  stage: HTMLElement;
  pages: readonly Page[];
  reduce: boolean;
  /** Renders journey time (timeline, walk frame, portal, HUD fills). */
  render: (time: number) => void;
  /** Called the moment a turn starts (labels change right away) and when it has settled. */
  onPage: (page: number, settled: boolean) => void;
  /** Called once when the intro has played. */
  onIntroDone: () => void;
  /** Resolves when the media for a turn through [from, to] is ready (walk frames) or after a timeout. */
  ready: (from: number, to: number) => Promise<void>;
  exitTo: () => Element | null;
  /** Called when an exit scroll (Finish / Skip) has arrived, with its target (to move focus there). */
  onExited?: (target: Element | null) => void;
  /** Called when the "Center view" offer should show / hide (journey partly out of the viewport). */
  onCenter?: (show: boolean) => void;
};

/** Small-scroll threshold that commits to the intro (one wheel notch / a short swipe is enough). */
/** Wheel distance (fraction of the viewport, at least 40 px) that commits to the intro; nudges add up. */
const INTRO_WHEEL = 0.06;
const INTRO_TOUCH = 36;
/** ms after the intro during which a still-running wheel stream (momentum) is swallowed. */
const POST_INTRO_GUARD = 450;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function book(o: Opts): BookApi {
  const { scroller, hero, track, stage, pages } = o;
  const last = pages.length - 1;
  const clock = { t: 0 };
  let page = 0;
  let turn: gsap.core.Animation | null = null;
  let queued: 1 | -1 | 0 = 0;
  let token = 0;
  let intro: "todo" | "playing" | "done" = "todo";
  /** When the intro settled; the trailing momentum of the triggering gesture is swallowed briefly. */
  let introEndAt = 0;
  let vh = scroller.clientHeight || window.innerHeight;
  let dockY = 0;

  const measure = () => {
    vh = scroller.clientHeight || window.innerHeight;
    // Stage and static hero are exactly one visible scroller viewport (no vh/svh/dvh mismatch: the page
    // scrolls inside the RN Web ScrollView, so its clientHeight is the visible height on iOS too).
    track.closest<HTMLElement>(".fl")?.style.setProperty("--sv", `${String(vh)}px`);
    dockY =
      track.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  };
  const y = () => scroller.scrollTop;
  const atDock = () => Math.abs(y() - dockY) < 3;
  const inHero = () => y() < dockY - 2;

  // ---- programmatic page scroll (dock, exit); interruptible by user input ----
  let scrollTw: gsap.core.Tween | null = null;
  const stopScroll = () => {
    scrollTw?.kill();
    scrollTw = null;
  };
  const scrollToY = (to: number, dur: number, ease = "sine.inOut", done?: () => void) => {
    stopScroll();
    const max = scroller.scrollHeight - scroller.clientHeight;
    const target = clamp(to, 0, max);
    const proxy = { y: y() };
    // Reduced motion: programmatic scrolls jump.
    if (Math.abs(target - proxy.y) < 1 || o.reduce) {
      scroller.scrollTop = target;
      done?.();
      return;
    }
    scrollTw = gsap.to(proxy, {
      y: target,
      duration: dur,
      ease,
      onUpdate: () => {
        scroller.scrollTop = proxy.y;
      },
      onComplete: () => {
        scrollTw = null;
        done?.();
      },
    });
  };
  const scrollDur = (dy: number) => clamp(0.5 + 1.1 * Math.sqrt(Math.abs(dy) / vh), 0.6, 2.4);
  const dock = () => {
    if (!atDock()) scrollToY(dockY, scrollDur(dockY - y()));
  };
  const exit = () => {
    const el = o.exitTo();
    const to = el
      ? el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + y()
      : dockY + vh;
    scrollToY(to, scrollDur(to - y()), "sine.inOut", () => {
      o.onExited?.(el);
    });
  };

  const draw = () => {
    o.render(clock.t);
  };

  // ---- turning pages ----
  let after: (() => void) | null = null;
  const finish = () => {
    turn = null;
    if (intro === "playing") {
      intro = "done";
      introEndAt = performance.now();
      o.onIntroDone();
    }
    o.onPage(page, true);
    const then = after;
    after = null;
    if (then) {
      then();
      return;
    }
    const q = queued;
    queued = 0;
    if (q > 0) next();
    else if (q < 0) prev();
  };
  /** Direction of the running turn: +1 forward, −1 back. */
  let turnDir: 1 | -1 = 1;
  // Turns start moving at once (owner: "the reaction to Next must be visible much sooner"); the intro keeps
  // its gentle in-out.
  const play = (to: number, dur: number, ease = "power2.out") => {
    const my = ++token;
    turnDir = to >= page ? 1 : -1;
    turn?.kill();
    const from = clock.t;
    const target = pages[to]?.t ?? 0;
    page = to;
    o.onPage(page, false);
    dock();
    // Placeholder keeps `turn` non-null while media loads, so presses queue instead of stacking.
    turn = gsap.delayedCall(9999, () => undefined);
    void o.ready(from, target).then(() => {
      if (my !== token) return;
      turn?.kill();
      if (o.reduce) {
        const tl = gsap.timeline({ onComplete: finish });
        tl.to(stage, { "--fade": 1, duration: 0.18, ease: "power1.in" });
        tl.add(() => {
          clock.t = target;
          draw();
        });
        tl.to(stage, { "--fade": 0, duration: 0.3, ease: "power1.out" });
        turn = tl;
        return;
      }
      turn = gsap.to(clock, { t: target, duration: dur, ease, onUpdate: draw, onComplete: finish });
    });
  };
  /** Adjacent forward = the page's own pacing; back = quicker; jumps grow with distance (as before). */
  const durFor = (to: number, adjacent: boolean) => {
    const dt = Math.abs((pages[to]?.t ?? 0) - clock.t);
    if (adjacent && to > page) return pages[to]?.dur ?? 2;
    if (adjacent) return clamp(dt * 9, 0.8, 2.6);
    return clamp(dt * 14, 1.2, 6);
  };
  /**
   * A press in the same direction while a turn runs: early in the turn it speeds the turn up; in the
   * second half (where the out-eased motion is already nearly still, so it looks finished) it completes
   * the turn at once and the press counts as the next page — one press, one visible step (owner).
   */
  const pressDuringTurn = (dir: 1 | -1) => {
    if (!turn) return;
    const done = turn.duration() > 0 ? turn.time() / turn.duration() : 1;
    if (done >= 0.5) {
      queued = dir;
      turn.progress(1);
    } else fastForward();
  };
  const fastForward = () => {
    if (!turn) return;
    const rem = turn.duration() - turn.time();
    if (rem > 0.45) turn.timeScale((turn.timeScale() * rem) / 0.45);
  };
  /** The intro: jump from the static hero to the identical stage (time 0), play doors + walk-in. */
  const playIntro = (then?: () => void) => {
    if (intro !== "todo") return;
    intro = "playing";
    stopScroll();
    scroller.scrollTop = dockY;
    clock.t = 0;
    draw();
    play(1, pages[1]?.dur ?? 7, "sine.inOut");
    if (then) after = then;
  };
  function next() {
    // Next / → again while the intro plays: speeds it up, or (late in it) finishes it and turns on.
    if (intro === "playing") {
      pressDuringTurn(1);
      return;
    }
    if (intro === "todo") {
      playIntro();
      return;
    }
    if (turn) {
      // Next / → while a page turns: speed the running animation up (no extra page). Against a running
      // backward turn it turns forward again.
      if (turnDir > 0) pressDuringTurn(1);
      else play(page + 1, durFor(page + 1, true));
      return;
    }
    if (page >= last) {
      exit();
      return;
    }
    play(page + 1, durFor(page + 1, true));
  }
  function prev() {
    if (intro !== "done") return;
    if (turn) {
      queued = 0;
      // Prev / ← while a page turns back: speed it up; against a forward turn: reverse it.
      if (turnDir < 0) pressDuringTurn(-1);
      else if (page > 1) play(page - 1, durFor(page - 1, true));
      return;
    }
    if (page <= 1) return; // nothing replays: the hero is reached by scrolling up
    play(page - 1, durFor(page - 1, true));
  }
  const goTo = (i: number) => {
    const to = clamp(i, 1, last);
    queued = 0;
    if (intro === "todo") {
      playIntro(
        to > 1
          ? () => {
              play(to, durFor(to, to === 2));
            }
          : undefined,
      );
      return;
    }
    if (intro === "playing") return; // ignored while the intro plays
    if (to === page && !turn) {
      dock();
      return;
    }
    play(to, durFor(to, Math.abs(to - page) === 1 && !turn));
  };
  const start = () => {
    if (intro === "todo") playIntro();
    else dock();
  };

  // ---- wheel: small scroll at the hero commits to the intro; afterwards native, with a dock catch ----
  let lastWheel = 0;
  let acc = 0;
  const newGesture = () => {
    acc = 0;
  };
  const onWheel = (e: WheelEvent) => {
    const now = performance.now();
    const continuing = now - lastWheel < 220; // same wheel stream (momentum) as the previous event
    // Small nudges add up; the tally resets after 1.5 s without wheel input.
    if (now - lastWheel > 1500) newGesture();
    lastWheel = now;
    if (intro === "playing") {
      e.preventDefault(); // ignored while the intro plays
      return;
    }
    if (intro === "todo" && (inHero() || atDock())) {
      e.preventDefault(); // the hero does not move until the intro commits
      if (e.deltaY > 0 || atDock()) {
        acc += Math.abs(e.deltaY);
        if (acc >= Math.max(40, vh * INTRO_WHEEL)) playIntro();
      }
      return;
    }
    // Right after the intro settles: swallow only the trailing momentum of the stream that triggered it
    // (≤ 450 ms), so inertia cannot throw the visitor past page 1. A new gesture scrolls at once.
    if (continuing && now - introEndAt < POST_INTRO_GUARD) {
      e.preventDefault();
      return;
    }
    // Otherwise the wheel is never captured (owner, 2026-11-04): plain page scrolling.
    stopScroll();
  };
  let settleTimer = 0;
  const onScroll = () => {
    syncCenter();
    if (scrollTw) return;
    if (intro === "todo") {
      // Arrived at the stage another way (scrollbar, from below after a nav link): once the scroll rests
      // there, dock and play the intro. Scrolls that only pass through (e.g. to Pricing) are left alone.
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (intro === "todo" && Math.abs(y() - dockY) < vh * 0.3) playIntro();
      }, 180);
      return;
    }
    if (intro === "playing" && !atDock()) {
      scroller.scrollTop = dockY;
      return;
    }
  };
  // "Center view": offered while the journey is partly out of the viewport (but still on screen).
  let centerShown = false;
  const syncCenter = () => {
    const r = stage.getBoundingClientRect();
    const sc = scroller.getBoundingClientRect();
    const overlap = Math.min(r.bottom, sc.bottom) - Math.max(r.top, sc.top);
    const show = intro === "done" && overlap > vh * 0.2 && Math.abs(y() - dockY) > 8;
    if (show !== centerShown) {
      centerShown = show;
      o.onCenter?.(show);
    }
  };
  const onPointerDown = () => {
    if (intro !== "playing") stopScroll();
  };

  // ---- keyboard (while the hero or the story is in view and focus is not elsewhere) ----
  const visible = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > r.height * 0.5;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName ?? "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || el?.isContentEditable) return;
    const k = e.key;
    const space = k === " " || k === "Spacebar";
    if (space && /^(BUTTON|A)$/.test(tag)) return; // Space presses the focused button
    const focusOk =
      !el ||
      el === document.body ||
      el === scroller ||
      track.contains(el) ||
      hero.contains(el) ||
      tag === "HTML";
    const horiz = k === "ArrowLeft" || k === "ArrowRight";
    const down = k === "ArrowDown" || k === "PageDown" || (space && !e.shiftKey);
    const up = k === "ArrowUp" || k === "PageUp" || (space && e.shiftKey);
    if (!horiz && !down && !up) return;
    if (!focusOk) return;
    if (intro === "playing") {
      e.preventDefault(); // scroll keys and ← are ignored; → / ↓ / PgDn / Space speed the intro up
      if (k === "ArrowRight" || down) pressDuringTurn(1);
      return;
    }
    // ← → turn pages (and → / ↓ / PgDn / Space at the hero commit the intro, like a small scroll).
    if (intro === "todo" && visible(hero) && (k === "ArrowRight" || down)) {
      e.preventDefault();
      playIntro();
      return;
    }
    if (horiz) {
      if (intro !== "done" || !visible(stage)) return;
      e.preventDefault();
      if (k === "ArrowRight") next();
      else prev();
      return;
    }
    // ↑ ↓ PgUp PgDn Space are plain page scrolling (the inner scroller does not get them natively).
    e.preventDefault();
    const fwd = down;
    const d = (k.startsWith("Arrow") ? 0.2 : 0.85) * vh * (fwd ? 1 : -1);
    scrollToY(y() + d, k.startsWith("Arrow") ? 0.25 : 0.5, "power2.out");
  };

  // ---- touch: hero swipe commits to the intro; one swipe = one page while the book is docked ----
  let sx = 0;
  let sy = 0;
  let claim = false;
  let fired = false;
  let skip = false;
  const onTouchStart = (e: TouchEvent) => {
    newGesture();
    if (intro !== "playing") stopScroll();
    const p = e.touches[0];
    const tgt = e.target as HTMLElement | null;
    const inStory = stage.contains(tgt);
    const heroTodo = intro === "todo" && (inHero() || atDock());
    skip =
      e.touches.length > 1 ||
      (!inStory && !heroTodo && intro !== "playing") ||
      Boolean(tgt?.closest("input,select,textarea,.calc,a,.no-swipe"));
    sx = p?.clientX ?? 0;
    sy = p?.clientY ?? 0;
    claim = false;
    fired = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (skip) return;
    const p = e.touches[0];
    const dx = (p?.clientX ?? sx) - sx;
    const dy = (p?.clientY ?? sy) - sy;
    if (intro === "playing") {
      e.preventDefault(); // ignored while the intro plays
      return;
    }
    if (intro === "todo") {
      e.preventDefault();
      if (!fired && -dy >= INTRO_TOUCH && Math.abs(dy) > Math.abs(dx)) {
        fired = true;
        playIntro();
      }
      return;
    }
    if (!claim && Math.hypot(dx, dy) > 8) {
      // After the intro only a HORIZONTAL swipe turns a page; a vertical one scrolls the page natively.
      if (Math.abs(dx) <= Math.abs(dy)) {
        skip = true;
        return;
      }
      claim = true;
    }
    if (claim) e.preventDefault();
    if (claim && !fired && Math.abs(dx) > 42) {
      fired = true;
      if (dx < 0) next();
      else prev();
    }
  };

  measure();
  o.onPage(0, true);
  draw();
  const ro = new ResizeObserver(() => {
    measure();
    if (intro !== "todo" && !atDock() && Math.abs(y() - dockY) < vh * 0.25)
      scroller.scrollTop = dockY;
    draw();
  });
  ro.observe(scroller);
  window.addEventListener("keydown", onKey);
  scroller.addEventListener("wheel", onWheel, { passive: false });
  scroller.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("pointerdown", onPointerDown, { passive: true });
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchmove", onTouchMove, { passive: false });

  return {
    destroy: () => {
      token++;
      window.clearTimeout(settleTimer);
      turn?.kill();
      stopScroll();
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("pointerdown", onPointerDown);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
    },
    next,
    prev,
    goTo,
    exit,
    start,
    center: () => {
      dock();
    },
    page: () => page,
    busy: () => turn !== null || scrollTw !== null,
  };
}
