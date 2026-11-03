import { gsap } from "gsap";

/**
 * Scroll-driven story (web): native scroll position IS the story position, Apple-product-page style.
 *
 * - The pinned track is laid out as transitions and holds (in viewport heights). Scroll position maps
 *   piecewise-linearly to journey time: inside a transition the timeline scrubs, inside a hold the scene
 *   rests fully composed. Nothing listens to wheel/touch to block it: trackpad momentum, mouse wheels, iOS
 *   momentum, the scrollbar and keyboard all move the page natively and reverse naturally.
 * - The story follows the scroll through a short critically-damped smoother (τ ≈ 70 ms) so mouse-wheel
 *   notches glide; it never lags more than a frame or two behind the scrollbar and never runs on its own.
 * - Gentle settle: only after the user has stopped (no wheel, touch, pointer or scroll for 180 ms) and only
 *   in the direction they were travelling, if a resting beat is within half a screen, the page eases into
 *   it. Any input cancels it at once. It never pulls backwards, so small wheel steps can never be trapped.
 * - HUD clicks, "Next", keyboard beats and "Skip" all use the same interruptible eased scroll tween (the
 *   chapter jump the owner liked); pressing again while it runs retargets from where it was heading.
 */

export type Beat = {
  /** Journey time (timeline seconds) at which the scene is fully composed. */
  t: number;
  /** Scroll length (viewport heights) of the transition INTO this beat (ignored for the first beat). */
  len: number;
  /** Scroll length (viewport heights) the composed scene rests for. */
  hold: number;
};

export type StoryLayout = {
  /** Scroll offsets (px from the track top) where each beat's hold starts / ends. */
  holdA: number[];
  holdB: number[];
  /** Track scroll length in px (track height − viewport). */
  len: number;
};

export type StoryApi = {
  destroy: () => void;
  /** Smoothly scrolls to beat i (same eased path as the chapter jump). */
  goTo: (i: number) => void;
  /** Next beat; past the last one it leaves the story (to `exit`). */
  next: () => void;
  /** Leaves the story: smooth scroll to the element below it. */
  exit: () => void;
  /** Before/after handle drag: sets the scroll position for a wipe fraction 0..1 (1 = all "after"). */
  scrubWipe: (k: number) => void;
  /** Scroll offset (absolute, in the scroller) of beat i's resting position (used by tests/screenshots). */
  holdY: (i: number) => number;
  layout: () => StoryLayout;
};

type Opts = {
  scroller: HTMLElement;
  track: HTMLElement;
  beats: readonly Beat[];
  /** Journey-time range of the before/after wipe, for dragging the handle. */
  wipe: readonly [number, number];
  /** Called every frame the smoothed position changes: journey time, track px, layout. */
  render: (time: number, px: number, layout: StoryLayout) => void;
  /** Element the story exits to. */
  exitTo: () => Element | null;
  /** Viewport heights the story occupies (sets the track height). Returns the total. */
  onTotal?: (vh: number) => void;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Total scroll length of the beats (viewport heights). */
export function totalVh(beats: readonly Beat[]) {
  return beats.reduce((s, b, i) => s + (i === 0 ? 0 : b.len) + b.hold, 0);
}

export function scrollStory(o: Opts): StoryApi {
  const { scroller, track, beats } = o;
  let vh = scroller.clientHeight || window.innerHeight;
  let top = 0;
  let lay: StoryLayout = { holdA: [], holdB: [], len: 1 };

  const measure = () => {
    vh = scroller.clientHeight || window.innerHeight;
    // The stage is exactly one scroller viewport high (no vh/svh/dvh mismatch on iOS: the page scrolls
    // inside the RN Web ScrollView, so its clientHeight is the visible height).
    const fl = track.closest<HTMLElement>(".fl");
    fl?.style.setProperty("--sv", `${String(vh)}px`);
    const total = totalVh(beats);
    track.style.height = `${String(Math.round((total + 1) * vh))}px`;
    top =
      track.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const holdA: number[] = [];
    const holdB: number[] = [];
    let u = 0;
    beats.forEach((b, i) => {
      if (i > 0) u += b.len * vh;
      holdA.push(u);
      u += b.hold * vh;
      holdB.push(u);
    });
    lay = { holdA, holdB, len: Math.max(1, u) };
    o.onTotal?.(total);
  };

  /** Track px → journey time (piecewise linear, flat in holds). */
  const timeAt = (px: number) => {
    const { holdA, holdB } = lay;
    for (let i = 0; i < beats.length; i++) {
      const a = holdA[i] ?? 0;
      const b = holdB[i] ?? 0;
      const t = beats[i]?.t ?? 0;
      if (px <= a) {
        if (i === 0) return t;
        const pb = holdB[i - 1] ?? 0;
        const pt = beats[i - 1]?.t ?? 0;
        return pt + ((t - pt) * (px - pb)) / Math.max(1, a - pb);
      }
      if (px <= b) return t;
    }
    return beats[beats.length - 1]?.t ?? 0;
  };
  /** Journey time → track px (inverse, inside transitions). */
  const pxAt = (time: number) => {
    const { holdA, holdB } = lay;
    for (let i = 1; i < beats.length; i++) {
      const t0 = beats[i - 1]?.t ?? 0;
      const t1 = beats[i]?.t ?? 0;
      if (time <= t1) {
        const a = holdB[i - 1] ?? 0;
        const b = holdA[i] ?? 0;
        return a + ((b - a) * (time - t0)) / Math.max(1e-6, t1 - t0);
      }
    }
    return lay.len;
  };

  // ---- smoothed follow (frame-rate independent) ----
  let target = 0; // track px from the scroll position
  let cur = -1;
  let last = 0;
  let snapNow = true;
  let rendered = Number.NaN;
  const readScroll = () => {
    target = scroller.scrollTop - top;
  };
  const tick = () => {
    const now = performance.now();
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    if (snapNow || cur < 0) {
      cur = target;
      snapNow = false;
    } else {
      const k = 1 - Math.exp(-dt / 70);
      cur += (target - cur) * k;
      if (Math.abs(target - cur) < 0.5) cur = target;
    }
    if (cur === rendered) return;
    rendered = cur;
    const px = clamp(cur, 0, lay.len);
    o.render(timeAt(px), cur, lay);
  };

  // ---- programmatic scroll (jumps, keyboard beats, settle) ----
  let tween: gsap.core.Tween | null = null;
  let tweenTarget: number | null = null;
  const stop = () => {
    tween?.kill();
    tween = null;
    tweenTarget = null;
  };
  const scrollToY = (y: number, dur: number, ease = "sine.inOut") => {
    stop();
    const max = scroller.scrollHeight - scroller.clientHeight;
    const to = clamp(y, 0, max);
    tweenTarget = to;
    const proxy = { y: scroller.scrollTop };
    tween = gsap.to(proxy, {
      y: to,
      duration: dur,
      ease,
      onUpdate: () => {
        scroller.scrollTop = proxy.y;
      },
      onComplete: () => {
        tween = null;
        tweenTarget = null;
      },
    });
  };
  /** Chapter-jump duration: grows with distance (in screens), like the original click-to-chapter path. */
  const jumpDur = (from: number, to: number) =>
    clamp(0.55 + 1.25 * Math.sqrt(Math.abs(to - from) / vh), 0.7, 4.6);

  const restY = (i: number) => {
    const a = lay.holdA[i] ?? 0;
    const b = lay.holdB[i] ?? a;
    // Land a little inside the hold so tiny jitters never leave the composed scene.
    return top + a + Math.min(0.12 * vh, (b - a) * 0.3);
  };
  const beatIndex = (y: number, dir: 1 | -1) => {
    const px = y - top;
    if (dir > 0) {
      for (let i = 0; i < beats.length; i++) if ((lay.holdA[i] ?? 0) > px + 4) return i;
      return beats.length; // past the last beat → exit
    }
    for (let i = beats.length - 1; i >= 0; i--) if ((lay.holdA[i] ?? 0) < px - 4) return i;
    return -1;
  };
  const goTo = (i: number) => {
    const j = clamp(i, 0, beats.length - 1);
    const y = j === 0 ? top : restY(j);
    scrollToY(y, jumpDur(scroller.scrollTop, y));
  };
  const exitY = () => {
    const el = o.exitTo();
    if (!el) return top + lay.len + vh;
    return (
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    );
  };
  const exit = () => {
    const y = exitY();
    scrollToY(y, jumpDur(scroller.scrollTop, y));
  };
  const step = (dir: 1 | -1) => {
    // Retarget from where a running jump is heading, so repeated presses queue instead of being lost.
    const from = tweenTarget ?? scroller.scrollTop;
    const i = beatIndex(from, dir);
    if (dir > 0 && i >= beats.length) {
      exit();
      return;
    }
    if (i < 0) {
      scrollToY(0, jumpDur(scroller.scrollTop, 0));
      return;
    }
    goTo(i);
  };

  // ---- input bookkeeping (never blocks anything) ----
  let lastInput = 0;
  let lastDir: 1 | -1 = 1;
  let touching = false;
  let pressed = false;
  let lastY = scroller.scrollTop;
  const userInput = () => {
    lastInput = performance.now();
    if (tween) stop(); // the user takes over immediately
  };
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) > 0.5) lastDir = e.deltaY > 0 ? 1 : -1;
    userInput();
  };
  const onTouchStart = () => {
    touching = true;
    userInput();
  };
  const onTouchEnd = () => {
    touching = false;
    lastInput = performance.now();
  };
  const onDown = () => {
    pressed = true;
    userInput();
  };
  const onUp = () => {
    pressed = false;
    lastInput = performance.now();
  };
  const onScroll = () => {
    const y = scroller.scrollTop;
    if (!tween && y !== lastY) {
      lastDir = y > lastY ? 1 : -1;
      lastInput = performance.now();
    }
    lastY = y;
    readScroll();
  };

  // ---- keyboard: works without clicking first (the scroller is an inner div, not the document) ----
  const inStory = () => {
    const px = scroller.scrollTop - top;
    return px >= -2 && px < lay.len - 2;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName ?? "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || el?.isContentEditable) return;
    const k = e.key;
    const isSpace = k === " " || k === "Spacebar";
    // Space on a focused button presses it.
    if (isSpace && /^(BUTTON|A)$/.test(tag)) return;
    let dir: 0 | 1 | -1 = 0;
    if (k === "PageDown" || k === "ArrowDown" || (isSpace && !e.shiftKey)) dir = 1;
    if (k === "PageUp" || k === "ArrowUp" || (isSpace && e.shiftKey)) dir = -1;
    if (k === "Home") {
      e.preventDefault();
      scrollToY(0, jumpDur(scroller.scrollTop, 0));
      return;
    }
    if (k === "End") {
      e.preventDefault();
      const y = scroller.scrollHeight;
      scrollToY(y, jumpDur(scroller.scrollTop, y));
      return;
    }
    if (dir === 0) return;
    e.preventDefault();
    lastInput = performance.now();
    lastDir = dir;
    const y = tweenTarget ?? scroller.scrollTop;
    const px = y - top;
    if (inStory() || (dir < 0 && px > 0 && px <= lay.len + vh * 0.5)) {
      step(dir);
      return;
    }
    // Outside the story: page-like steps (arrows: a short step).
    const d = k.startsWith("Arrow") ? vh * 0.2 : vh * 0.85;
    scrollToY(y + dir * d, k.startsWith("Arrow") ? 0.25 : 0.5, "power2.out");
  };

  // ---- gentle settle, only after the user stops ----
  const settleCheck = () => {
    if (tween || touching || pressed) return;
    if (performance.now() - lastInput < 180) return;
    const px = scroller.scrollTop - top;
    if (px <= 0 || px >= lay.len) return;
    for (let i = 0; i < beats.length; i++)
      if (px >= (lay.holdA[i] ?? 0) - 1 && px <= (lay.holdB[i] ?? 0) + 1) return; // resting already
    // Nearest hold in the travel direction, within half a screen.
    let y: number | null = null;
    if (lastDir > 0) {
      const i = beatIndex(scroller.scrollTop, 1);
      if (i < beats.length && (lay.holdA[i] ?? 0) - px <= vh * 0.5) y = restY(i);
    } else {
      const i = beatIndex(scroller.scrollTop, -1);
      if (i >= 0 && px - (lay.holdB[i] ?? 0) <= vh * 0.5) {
        const a = lay.holdA[i] ?? 0;
        const b = lay.holdB[i] ?? a;
        y = top + b - Math.min(0.12 * vh, (b - a) * 0.3);
      }
    }
    if (y === null) return;
    const dist = Math.abs(y - scroller.scrollTop) / vh;
    scrollToY(y, clamp(0.35 + dist * 1.1, 0.35, 0.9), "sine.inOut");
  };
  const settleTimer = window.setInterval(settleCheck, 60);

  // ---- before/after handle drag → scroll (story and scrollbar always agree) ----
  const scrubWipe = (k: number) => {
    stop();
    lastInput = performance.now();
    const px = pxAt(o.wipe[0] + (o.wipe[1] - o.wipe[0]) * clamp(k, 0, 1));
    scroller.scrollTop = top + px;
    readScroll();
    snapNow = true; // the handle follows the finger directly, no smoothing
  };

  measure();
  readScroll();
  snapNow = true;
  const ro = new ResizeObserver(() => {
    measure();
    readScroll();
    snapNow = true;
    rendered = Number.NaN;
  });
  ro.observe(scroller);
  gsap.ticker.add(tick);
  const opt: AddEventListenerOptions = { passive: true };
  scroller.addEventListener("scroll", onScroll, opt);
  scroller.addEventListener("wheel", onWheel, opt);
  scroller.addEventListener("touchstart", onTouchStart, opt);
  window.addEventListener("touchend", onTouchEnd, opt);
  window.addEventListener("touchcancel", onTouchEnd, opt);
  scroller.addEventListener("pointerdown", onDown, opt);
  window.addEventListener("pointerup", onUp, opt);
  window.addEventListener("keydown", onKey);

  return {
    destroy: () => {
      stop();
      ro.disconnect();
      window.clearInterval(settleTimer);
      gsap.ticker.remove(tick);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      scroller.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      track.style.height = "";
    },
    goTo,
    next: () => {
      step(1);
    },
    exit,
    scrubWipe,
    holdY: (i: number) => (i === 0 ? top : restY(i)),
    layout: () => lay,
  };
}
