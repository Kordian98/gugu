import { gsap } from "gsap";

/**
 * The story as a BOOK (web, owner 2026-11-04). Only the NAVIGATION is book-like; the animations (walk
 * frames, door portal, before/after sweep, reveals, counters) are the same timeline as before.
 *
 * - Page 0 → 1 (hero → the doors open and we walk in) stays SCROLL-DRIVEN: the pinned track is one
 *   "door segment" long; its scroll position scrubs journey time 0 → pages[1].t. Scrolling up from page 1
 *   closes the doors again.
 * - From page 1 on, the story moves only by explicit turns: Next/Prev, HUD chapters, keys (→ ↓ PgDn Space /
 *   ← ↑ PgUp Shift+Space while the story is in view) and one touch swipe = one page. A turn plays the
 *   existing timeline from one page's composed state to the next at the original pacing and cannot stop
 *   half-way; Next during a turn fast-forwards it (≤ 0.45 s) and queues at most one more page; Prev
 *   reverses it. Reduced motion: no door scrub, a turn is a short crossfade.
 * - Wheels and trackpads never turn pages: below the dock they scroll the page past the story natively.
 * - The DOCK (door segment end = page 1, story fully pinned) catches every gesture that started on the
 *   other side of it: a fast flick at the hero lands exactly on page 1 (never further), a flick up from the
 *   sections below lands on the book at the page the visitor left. A new upward gesture from the dock on a
 *   later page first turns the book back to page 1 (quickly), the next one closes the doors.
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
  /** Smooth jump to page i (the chapter jump: duration grows with distance). */
  goTo: (i: number) => void;
  /** Smoothly scrolls to the first section after the story. */
  exit: () => void;
  page: () => number;
  /** A turn or a programmatic scroll is running. */
  busy: () => boolean;
};

type Opts = {
  scroller: HTMLElement;
  track: HTMLElement;
  stage: HTMLElement;
  pages: readonly Page[];
  /** Scroll length of the door segment, in screens (0 with reduced motion). */
  doorLen: number;
  reduce: boolean;
  /** Renders journey time (timeline, walk frame, portal, HUD fills). */
  render: (time: number) => void;
  /** Called the moment a turn starts (labels change right away) and when it has settled. */
  onPage: (page: number, settled: boolean) => void;
  /** Resolves when the media for a turn through [from, to] is ready (walk frames) or after a timeout. */
  ready: (from: number, to: number) => Promise<void>;
  exitTo: () => Element | null;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function book(o: Opts): BookApi {
  const { scroller, track, stage, pages } = o;
  const last = pages.length - 1;
  const doorT = pages[1]?.t ?? 0;
  const clock = { t: 0 };
  let page = 0; // the page we are on, or turning TO
  let turn: gsap.core.Animation | null = null;
  let queued: 1 | -1 | 0 = 0;
  let token = 0;
  let vh = scroller.clientHeight || window.innerHeight;
  let top = 0;
  let dockY = 0;

  const measure = () => {
    vh = scroller.clientHeight || window.innerHeight;
    // The stage is exactly one visible scroller viewport (no vh/svh/dvh mismatch: the page scrolls inside
    // the RN Web ScrollView, so its clientHeight is the visible height on iOS too).
    track.closest<HTMLElement>(".fl")?.style.setProperty("--sv", `${String(vh)}px`);
    track.style.height = `${String(Math.round((1 + o.doorLen) * vh))}px`;
    top =
      track.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    dockY = top + Math.round(o.doorLen * vh);
  };
  const y = () => scroller.scrollTop;

  // ---- programmatic page scroll (door segment via Next, dock, exit); any user input interrupts it ----
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
    if (Math.abs(target - proxy.y) < 1) {
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
  const atDock = () => Math.abs(y() - dockY) < 3;
  const exit = () => {
    const el = o.exitTo();
    const to = el
      ? el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + y()
      : dockY + vh;
    scrollToY(to, scrollDur(to - y()));
  };

  // ---- the displayed time: scroll-scrubbed in the door segment, turn-driven in the book ----
  let shown = Number.NaN;
  let lastNow = 0;
  const scrollMode = () => !turn && page <= 1 && o.doorLen > 0;
  const tick = () => {
    const now = performance.now();
    const dt = lastNow ? Math.min(64, now - lastNow) : 16;
    lastNow = now;
    if (scrollMode()) {
      const k = clamp((y() - top) / Math.max(1, dockY - top), 0, 1);
      const target = k * doorT;
      // Short smoothing (τ ≈ 70 ms) so mouse-wheel notches glide; converges in a few frames.
      clock.t += (target - clock.t) * (1 - Math.exp(-dt / 70));
      if (Math.abs(target - clock.t) < 1e-4) clock.t = target;
      const p = k >= 0.999 ? 1 : 0;
      if (p !== page && !scrollTw) {
        page = p;
        o.onPage(page, true);
      }
    }
    if (clock.t !== shown) {
      shown = clock.t;
      o.render(clock.t);
    }
  };

  // ---- turning pages (from page 1 on) ----
  let after: (() => void) | null = null;
  const finish = () => {
    turn = null;
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
  const play = (to: number, dur: number, ease = "sine.inOut") => {
    const my = ++token;
    turn?.kill();
    stopScroll();
    const from = clock.t;
    const target = pages[to]?.t ?? 0;
    page = to;
    o.onPage(page, false);
    // Keep the book docked while it turns.
    if (!atDock() && o.doorLen > 0) scrollToY(dockY, scrollDur(dockY - y()));
    if (o.doorLen === 0 && Math.abs(y() - top) > 3) scrollToY(top, scrollDur(top - y()));
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
        });
        tl.to(stage, { "--fade": 0, duration: 0.3, ease: "power1.out" });
        turn = tl;
        return;
      }
      turn = gsap.to(clock, { t: target, duration: dur, ease, onComplete: finish });
    });
  };
  /** Adjacent forward = the page's own pacing; back = quicker; jumps grow with distance (as before). */
  const durFor = (to: number, adjacent: boolean) => {
    const dt = Math.abs((pages[to]?.t ?? 0) - clock.t);
    if (adjacent && to > page) return pages[to]?.dur ?? 2;
    if (adjacent) return clamp(dt * 9, 0.8, 2.6);
    return clamp(dt * 14, 1.2, 6);
  };
  const fastForward = () => {
    if (!turn) return;
    const rem = turn.duration() - turn.time();
    if (rem > 0.45) turn.timeScale((turn.timeScale() * rem) / 0.45);
  };
  /** Page 0 → 1 by button/key: scroll the door segment open at the original pace. */
  const openDoors = (then?: () => void) => {
    if (o.doorLen === 0) {
      play(1, pages[1]?.dur ?? 3);
      if (then) after = then;
      return;
    }
    page = 1;
    o.onPage(1, false);
    const k = clamp((y() - top) / Math.max(1, dockY - top), 0, 1);
    scrollToY(dockY, Math.max(0.6, (pages[1]?.dur ?? 3) * (1 - k)), "sine.inOut", then);
  };
  const closeDoors = () => {
    page = 0;
    o.onPage(0, false);
    if (o.doorLen === 0) {
      play(0, durFor(0, true));
      return;
    }
    scrollToY(top, clamp((pages[1]?.dur ?? 3) * 0.55, 0.8, 2.4));
  };
  function next() {
    if (turn) {
      if (queued === 0) queued = 1;
      fastForward();
      return;
    }
    if (page === 0 || (page === 1 && !atDock() && o.doorLen > 0)) {
      openDoors();
      return;
    }
    if (page >= last) {
      exit();
      return;
    }
    play(page + 1, durFor(page + 1, true));
  }
  function prev() {
    if (turn) {
      queued = 0;
      if (page > 1 && clock.t < (pages[page]?.t ?? 0)) play(page - 1, durFor(page - 1, true));
      else fastForward();
      return;
    }
    if (page <= 0) return;
    if (page === 1) {
      closeDoors();
      return;
    }
    play(page - 1, durFor(page - 1, true));
  }
  const goTo = (i: number) => {
    const to = clamp(i, 0, last);
    queued = 0;
    after = null;
    if (to === 0) {
      if (page <= 1 && !turn) closeDoors();
      else {
        play(1, durFor(1, false));
        after = closeDoors;
      }
      return;
    }
    if (page === 0 || (scrollMode() && !atDock())) {
      // From the hero: open the doors by scroll first, then turn on to the chapter.
      openDoors(
        to > 1
          ? () => {
              play(to, durFor(to, to === 2));
            }
          : undefined,
      );
      return;
    }
    if (to === page && !turn) {
      if (!atDock()) scrollToY(dockY, scrollDur(dockY - y()));
      return;
    }
    play(to, durFor(to, Math.abs(to - page) === 1 && !turn));
  };

  // ---- the dock catches gestures that started on the other side of it ----
  let side: -1 | 0 | 1 = 0;
  let lastWheel = 0;
  let caught = false;
  const sideNow = (): -1 | 0 | 1 => (y() < dockY - 2 ? -1 : y() > dockY + 2 ? 1 : 0);
  const newGesture = () => {
    side = sideNow();
    caught = false;
  };
  const rewind = () => {
    // Upward from the dock on a later page: turn back to page 1 first (quick), doors stay open.
    if (!turn) play(1, clamp(Math.abs(clock.t - doorT) * 5, 0.6, 1.4));
  };
  const onWheel = (e: WheelEvent) => {
    const now = performance.now();
    if (now - lastWheel > 220) newGesture();
    lastWheel = now;
    stopScroll();
    if (o.doorLen === 0 || Math.abs(e.deltaY) < 0.5) return;
    const to = y() + e.deltaY;
    const crossDown = side < 0 && to > dockY;
    const crossUp = side > 0 && to < dockY;
    const leaveUp = side === 0 && e.deltaY < 0 && (page > 1 || turn !== null);
    if (caught || crossDown || crossUp || leaveUp) {
      e.preventDefault();
      if (!caught) {
        caught = true;
        scroller.scrollTop = dockY;
        if (leaveUp) rewind();
      }
    }
  };
  const onScroll = () => {
    if (o.doorLen === 0 || scrollTw) return;
    // Touch momentum and other native scrolls: clamp at the dock when crossing it.
    if ((side < 0 && y() > dockY) || (side > 0 && y() < dockY)) scroller.scrollTop = dockY;
    else if (side === 0 && y() < dockY - 2 && (page > 1 || turn !== null)) {
      scroller.scrollTop = dockY;
      rewind();
    }
  };
  const onPointerDown = (e: PointerEvent) => {
    // The scrollbar (pointer on the scroller itself) may go anywhere.
    if (e.target === scroller) side = 0;
    stopScroll();
  };

  // ---- keyboard (only while the story is in view and focus is not elsewhere) ----
  const inView = () => {
    const r = stage.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const vis = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
    return vis > r.height * 0.5;
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
      !el || el === document.body || el === scroller || track.contains(el) || tag === "HTML";
    const fwd =
      k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || (space && !e.shiftKey);
    const back = k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || (space && e.shiftKey);
    if (!fwd && !back) return;
    if (focusOk && inView()) {
      e.preventDefault();
      if (fwd) next();
      else prev();
      return;
    }
    if (k === "ArrowLeft" || k === "ArrowRight" || !focusOk) return;
    // Below the story: keyboard page scrolling (the inner scroller does not get it natively).
    e.preventDefault();
    const d = (k.startsWith("Arrow") ? 0.2 : 0.85) * vh * (fwd ? 1 : -1);
    scrollToY(Math.max(dockY, y() + d), k.startsWith("Arrow") ? 0.25 : 0.5, "power2.out");
  };

  // ---- touch: one swipe = one page while the book is docked (doors: native scroll) ----
  let sx = 0;
  let sy = 0;
  let claim = false;
  let fired = false;
  let skip = false;
  const onTouchStart = (e: TouchEvent) => {
    newGesture();
    stopScroll();
    const p = e.touches[0];
    const tgt = e.target as HTMLElement | null;
    skip =
      e.touches.length > 1 ||
      !(atDock() || o.doorLen === 0) ||
      Boolean(tgt?.closest("input,select,textarea,.sp-knob,.calc,a,.no-swipe"));
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
    if (!claim && Math.hypot(dx, dy) > 8) {
      const horiz = Math.abs(dx) > Math.abs(dy);
      // Native scroll for: swiping down on page 0/1 (doors close / nothing above), swiping up on the last
      // page when no turn is running (scrolls on past the story).
      const nativeDown = !horiz && dy > 0 && page <= 1 && !turn && o.doorLen > 0;
      const nativeUp = !horiz && dy < 0 && page >= last && !turn;
      if (nativeDown || nativeUp || (page === 0 && o.doorLen > 0)) {
        skip = true;
        return;
      }
      claim = true;
    }
    if (claim) e.preventDefault();
    if (claim && !fired && (Math.abs(dx) > 42 || Math.abs(dy) > 42)) {
      fired = true;
      const fwd = Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0;
      if (fwd) next();
      else prev();
    }
  };

  measure();
  clock.t = scrollMode() ? clamp((y() - top) / Math.max(1, dockY - top), 0, 1) * doorT : 0;
  o.onPage(0, true);
  tick();
  const ro = new ResizeObserver(() => {
    measure();
    if (page > 1 && !turn) scroller.scrollTop = Math.max(y(), 0);
    shown = Number.NaN;
  });
  ro.observe(scroller);
  gsap.ticker.add(tick);
  window.addEventListener("keydown", onKey);
  scroller.addEventListener("wheel", onWheel, { passive: false });
  scroller.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("pointerdown", onPointerDown, { passive: true });
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  stage.addEventListener("touchmove", onTouchMove, { passive: false });

  return {
    destroy: () => {
      token++;
      turn?.kill();
      stopScroll();
      ro.disconnect();
      gsap.ticker.remove(tick);
      window.removeEventListener("keydown", onKey);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("pointerdown", onPointerDown);
      scroller.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      track.style.height = "";
    },
    next,
    prev,
    goTo,
    exit,
    page: () => page,
    busy: () => turn !== null || scrollTw !== null,
  };
}
