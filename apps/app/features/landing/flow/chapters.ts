import { gsap } from "gsap";

/**
 * Cinematic scene stepping for the Journey (web). Inside the pinned track, one wheel notch, trackpad
 * flick or swipe plays the WHOLE transition to the next scene at a fixed, calm pace (per-scene durations,
 * sine ease) by tweening the scroller; input during a transition is swallowed so it never speeds up or
 * stutters. Past the last scene (or above the first) native scrolling takes over again. Keyboard and
 * scrollbar scrolling stay native (the scrubbed timeline still follows them).
 */
export type Chapters = {
  destroy: () => void;
  /** Plays the transition to the next scene (or scrolls on past the last). */
  next: () => void;
  /** Plays the transition to scene i (duration scales with distance). */
  goTo: (i: number) => void;
  /** Smoothly scrolls past the story to `el`. */
  skipTo: (el: Element | null) => void;
};

export function chapterScroller(
  scroller: HTMLElement,
  track: HTMLElement,
  stops: readonly number[],
  durations: readonly number[],
) {
  let busy = false;
  let tween: gsap.core.Tween | null = null;
  const range = () => {
    const top =
      track.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    return { top, len: Math.max(1, track.offsetHeight - scroller.clientHeight) };
  };
  const progress = () => {
    const { top, len } = range();
    return (scroller.scrollTop - top) / len;
  };
  const tweenTo = (y: number, dur: number) => {
    busy = true;
    tween?.kill();
    tween = gsap.to(scroller, {
      scrollTop: y,
      duration: dur,
      ease: "sine.inOut",
      onComplete: () => {
        setTimeout(() => {
          busy = false;
        }, 260);
      },
    });
  };
  const go = (dir: 1 | -1): boolean => {
    const p = progress();
    if (p < -0.002 || p > 1.002) return false; // outside the journey: native scroll
    let i = dir > 0 ? stops.findIndex((s) => s > p + 0.004) : -1;
    if (dir < 0)
      for (let k = stops.length - 1; k >= 0; k--)
        if ((stops[k] ?? 0) < p - 0.004) {
          i = k;
          break;
        }
    if (i < 0) return false; // beyond last / before first: let the page scroll on
    const target = stops[i] ?? 0;
    const from = dir > 0 ? i - 1 : i;
    const dur = durations[Math.max(0, Math.min(durations.length - 1, from))] ?? 2.5;
    const { top, len } = range();
    tweenTo(top + target * len, dur);
    return true;
  };

  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) < 2) return;
    const p = progress();
    if (p < -0.002 || p > 1.002) return;
    if (busy) {
      e.preventDefault();
      return;
    }
    if (go(e.deltaY > 0 ? 1 : -1)) e.preventDefault();
  };
  let y0 = 0;
  let fired = false;
  const onTouchStart = (e: TouchEvent) => {
    y0 = e.touches[0]?.clientY ?? 0;
    fired = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    const p = progress();
    if (p < -0.002 || p > 1.002) return;
    if (busy || fired) {
      e.preventDefault();
      return;
    }
    const dy = y0 - (e.touches[0]?.clientY ?? y0);
    if (Math.abs(dy) < 14) {
      e.preventDefault();
      return;
    }
    fired = true;
    if (go(dy > 0 ? 1 : -1)) e.preventDefault();
  };
  scroller.addEventListener("wheel", onWheel, { passive: false });
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchmove", onTouchMove, { passive: false });
  return {
    destroy: () => {
      tween?.kill();
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
    },
    next: () => {
      if (busy) return;
      if (!go(1)) {
        const { top, len } = range();
        tweenTo(top + len + scroller.clientHeight * 0.02, 1.4);
      }
    },
    goTo: (i: number) => {
      const target = stops[Math.max(0, Math.min(stops.length - 1, i))] ?? 0;
      const p = progress();
      const { top, len } = range();
      const span = Math.abs(target - p);
      tweenTo(top + target * len, Math.min(6, Math.max(1.2, span * 14)));
    },
    skipTo: (el: Element | null) => {
      if (!el) return;
      const y =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      tweenTo(y, 1.6);
    },
  };
}
