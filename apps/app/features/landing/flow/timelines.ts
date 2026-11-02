import { gsap } from "gsap";

type Q = (sel: string) => Element[];
type TL = gsap.core.Timeline;

/** Nearest scrolling ancestor (the RN Web ScrollView div), else the document. */
export function scrollParent(el: HTMLElement | null): Element {
  let n = el?.parentElement ?? null;
  while (n) {
    if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight)
      return n;
    n = n.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Scrubbed timeline over a sticky track (0..1 = track top hits viewport top .. track bottom hits bottom). */
export function trackTimeline(trigger: HTMLElement, scrub = 0.4): TL {
  return gsap.timeline({
    defaults: { ease: "power2.out", duration: 0.08 },
    scrollTrigger: {
      trigger,
      scroller: scrollParent(trigger),
      start: "top top",
      end: "bottom bottom",
      scrub,
      invalidateOnRefresh: true,
    },
  });
}

const show = (tl: TL, q: Q, sel: string, at: number, from: gsap.TweenVars = { y: 28 }) => {
  tl.fromTo(q(sel), { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }, at);
};
const hide = (tl: TL, q: Q, sel: string, at: number, to: gsap.TweenVars = { y: -20 }) => {
  tl.to(q(sel), { opacity: 0, ...to }, at);
};
const end = (tl: TL) => {
  tl.to({}, { duration: 0.001 }, 0.999);
};

/** Walk 1 (street → doors → reception): the title leaves as the doors open. */
export function buildEnter(tl: TL, q: Q) {
  tl.to(q(".wk-title"), { opacity: 0, y: -40, duration: 0.14 }, 0.12);
  end(tl);
}

/** Walk 2 (reception → treatment area): features of the room appear once we arrive. */
export function buildFeatures(tl: TL, q: Q) {
  hide(tl, q, ".wk-cap", 0.3);
  tl.to(q(".wk-scrim"), { opacity: 1, duration: 0.1 }, 0.6);
  show(tl, q, ".ov .t", 0.64);
  show(tl, q, ".ft-lap", 0.66, { x: 80, scale: 0.96 });
  q(".ft-i").forEach((el, i) => {
    tl.fromTo(el, { opacity: 0, y: 26 }, { opacity: 1, y: 0 }, 0.72 + i * 0.045);
  });
  end(tl);
}

/** Walk 3 (treatment → back office): the owner's overview, the cited stat and the assistant. */
export function buildOffice(tl: TL, q: Q) {
  hide(tl, q, ".wk-cap", 0.3);
  tl.to(q(".wk-scrim"), { opacity: 1, duration: 0.1 }, 0.6);
  show(tl, q, ".ov .t", 0.64);
  show(tl, q, ".of-lap", 0.66, { x: -80, scale: 0.96 });
  q(".of-side .card").forEach((el, i) => {
    tl.fromTo(el, { opacity: 0, y: 26 }, { opacity: 1, y: 0 }, 0.74 + i * 0.06);
  });
  end(tl);
}

/** Front desk: Zalo pings stack up, the notebook fills and gets crossed out, then the same desk turns calm. */
export function buildPain(tl: TL, q: Q) {
  show(tl, q, ".pn-a", 0.0, { y: 30 });
  show(tl, q, ".pn-sa", 0.06, { y: 30 });
  q(".pn-n").forEach((el, i) => {
    tl.fromTo(el, { opacity: 0, y: -26, scale: 0.94 }, { opacity: 1, y: 0, scale: 1 }, 0.06 + i * 0.06);
  });
  show(tl, q, ".pn-book", 0.18, { y: 40, rotate: -7 });
  tl.set(q(".pn-book"), { rotate: -3 }, 0.27);
  tl.to(q(".pn-e.x2 s"), { scaleX: 1, duration: 0.05 }, 0.34);
  tl.to(q(".pn-e.x3 s"), { scaleX: 1, duration: 0.05 }, 0.4);
  // transformation
  tl.to(q(".pn-calmv"), { opacity: 1, duration: 0.1, ease: "none" }, 0.52);
  hide(tl, q, ".pn-n", 0.52, { y: -14, scale: 0.96, stagger: 0.01 });
  hide(tl, q, ".pn-book", 0.52, { y: 30 });
  hide(tl, q, ".pn-a", 0.54);
  hide(tl, q, ".pn-sa", 0.54);
  show(tl, q, ".pn-b", 0.6);
  show(tl, q, ".pn-sb", 0.62);
  q(".pn-gi").forEach((el, i) => {
    tl.fromTo(el, { opacity: 0, x: -24 }, { opacity: 1, x: 0 }, 0.66 + i * 0.06);
  });
  end(tl);
}

/**
 * Before/after split + time-saved card. Steps highlight, cards appear; the counter writes text only when
 * its formatted value changes (no per-frame layout), the ring animates stroke-dashoffset on one circle.
 */
export function buildBeforeAfter(tl: TL, q: Q, fmt: (n: number, digits: number) => string) {
  const step = (sel: string, at: number) => {
    tl.to(q(sel), { opacity: 1, scale: 1.02, color: "#221024", duration: 0.05 }, at).to(
      q(sel),
      { scale: 1, duration: 0.03 },
      at + 0.05,
    );
  };
  const card = (sel: string, at: number, from: gsap.TweenVars = { y: 24 }) => {
    tl.fromTo(q(sel), { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.07 }, at);
  };
  step(".bs1", 0.04);
  card(".bc-zalo", 0.04);
  step(".bs2", 0.24);
  card(".bc-book", 0.24, { y: 30, rotate: -3 });
  step(".bs3", 0.44);
  card(".bc-call", 0.44);
  step(".bs4", 0.64);
  card(".bc-forgot", 0.64, { scale: 1.3 });
  step(".as1", 0.04);
  card(".ac-zalo", 0.04);
  step(".as2", 0.18);
  card(".ac-ok", 0.18, { scale: 0.85 });
  step(".as3", 0.32);
  card(".ac-cal", 0.32, { y: 40, scale: 0.94 });
  step(".as4", 0.5);
  card(".ac-rem", 0.5);
  step(".as5", 0.66);
  card(".ac-come", 0.66, { scale: 0.85 });

  const targets: [string, number, number][] = [
    [".sv-num", 6.5, 1],
    [".sv-r1", 38, 0],
    [".sv-r2", 21, 0],
    [".sv-r3", 24, 0],
  ];
  const v = { p: 0 };
  const last: string[] = [];
  const els = targets.map(([sel]) => q(sel)[0] as HTMLElement | undefined);
  tl.to(
    v,
    {
      p: 1,
      duration: 0.72,
      ease: "none",
      onUpdate: () => {
        targets.forEach(([, to, d], i) => {
          const s = fmt(to * v.p, d);
          const el = els[i];
          if (el && last[i] !== s) {
            last[i] = s;
            el.textContent = s;
          }
        });
      },
    },
    0.04,
  );
  const ring = q(".sv-ring .fg")[0];
  if (ring) {
    const c = 2 * Math.PI * 40;
    tl.fromTo(ring, { strokeDashoffset: c }, { strokeDashoffset: c * 0.22, duration: 0.72, ease: "none" }, 0.04);
  }
  end(tl);
}
