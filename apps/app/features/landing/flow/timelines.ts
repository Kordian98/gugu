import { gsap } from "gsap";

import type { Segment, WalkPlayer } from "./sequence";

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

/** Scrubbed timeline over a sticky track (0..1 = track top at viewport top .. track bottom at bottom). */
export function trackTimeline(trigger: HTMLElement, scrub = 0.5, snap?: number[]): TL {
  return gsap.timeline({
    defaults: { ease: "power2.out", duration: 0.02 },
    scrollTrigger: {
      trigger,
      scroller: scrollParent(trigger),
      start: "top top",
      end: "bottom bottom",
      scrub,
      invalidateOnRefresh: true,
      // Chapter snapping: one wheel tick / swipe plays the whole transition to the next scene.
      ...(snap
        ? {
            snap: {
              snapTo: snap,
              directional: true,
              delay: 0.02,
              duration: { min: 0.9, max: 2.2 },
              ease: "power1.inOut",
              inertia: false,
            },
          }
        : {}),
    },
  });
}

// UI enters slowly: each element takes ~0.04 of the track (≈0.6–1 s inside a scene transition).
const D = 0.04;
const show = (tl: TL, q: Q, sel: string, at: number, from: gsap.TweenVars = { y: 28 }, d = D) => {
  tl.fromTo(
    q(sel),
    { opacity: 0, ...from },
    { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, duration: d, ease: "power2.out" },
    at,
  );
};
const hide = (tl: TL, q: Q, sel: string, at: number, to: gsap.TweenVars = { y: -20 }) => {
  tl.to(q(sel), { opacity: 0, duration: 0.025, ease: "power1.in", ...to }, at);
};
const stagger = (
  tl: TL,
  q: Q,
  sel: string,
  at: number,
  step: number,
  from: gsap.TweenVars,
  d = 0.03,
) => {
  q(sel).forEach((el, i) => {
    tl.fromTo(
      el,
      { opacity: 0, ...from },
      { opacity: 1, x: 0, y: 0, scale: 1, duration: d, ease: "power2.out" },
      at + i * step,
    );
  });
};

/** Journey phases (fractions of the track). */
const PH = {
  portal: [0, 0.05],
  w1: [0.05, 0.17],
  pain: 0.17,
  swap: 0.36,
  calmOut: 0.48,
  w2: [0.5, 0.61],
  feat: 0.61,
  featOut: 0.735,
  w3: [0.76, 0.88],
  office: 0.88,
} as const;

/** Scenes one scroll gesture steps between: hero · front desk (built) · calm · treatment area · office. */
export const STOPS = [0, 0.345, 0.462, 0.725, 1] as const;
/** Seconds per transition (stop i → i+1): door + walk + desk build, calm, walk + features, walk + office. */
export const DURATIONS = [6.0, 3.8, 5.6, 5.2] as const;

/** Which walk frame to show at journey time t. */
function frameAt(t: number): [Segment, number] {
  const lin = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  if (t < PH.w1[1]) return ["w1", lin(PH.w1[0], PH.w1[1])];
  if (t < PH.swap + 0.02) return ["w1", 1];
  if (t < PH.w2[1]) return ["w2", lin(PH.w2[0], PH.w2[1])];
  if (t < PH.w3[0]) return ["w2", 1];
  return ["w3", lin(PH.w3[0], PH.w3[1])];
}

type Videos = { stress: HTMLVideoElement | null; calm: HTMLVideoElement | null };

/**
 * The single-scene journey: arched door portal (hero) → full-bleed walk in → front desk drowning → calm
 * (same receptionist, matching 16:9 loops) → walk to the treatment area (features) → walk to the back
 * office (overview, stat, assistant). Canvas frame, loop playback and the portal clip are driven from the
 * smoothed timeline time; everything else is transform/opacity.
 */
export function buildJourney(root: HTMLElement, q: Q, player: WalkPlayer, v: Videos) {
  const tl = trackTimeline(root, 0.25);
  const frame = q(".jr-frame")[0] as HTMLElement | undefined;
  const media = q(".jr-media")[0] as HTMLElement | undefined;
  const mobile = player.mobile;
  let lastClip = "";
  const portal = (k: number) => {
    // k: 0 = arched window in the hero column, 1 = full screen.
    if (!frame || !media) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const e = 1 - Math.pow(1 - k, 3);
    const r = mobile
      ? { t: H * 0.58, rt: W * 0.05, b: H * 0.03, l: W * 0.05 }
      : { t: H * 0.15, rt: W * 0.05, b: H * 0.06, l: W * 0.53 };
    const pw = W - r.l - r.rt;
    const t = r.t * (1 - e);
    const rt = r.rt * (1 - e);
    const b = r.b * (1 - e);
    const l = r.l * (1 - e);
    const arch = (pw / 2) * (1 - e);
    const corner = 26 * (1 - e);
    const clip = `inset(${t.toFixed(1)}px ${rt.toFixed(1)}px ${b.toFixed(1)}px ${l.toFixed(1)}px round ${arch.toFixed(1)}px ${arch.toFixed(1)}px ${corner.toFixed(1)}px ${corner.toFixed(1)}px)`;
    if (clip !== lastClip) {
      lastClip = clip;
      frame.style.clipPath = clip;
      // Keep the doors centred in the window while it grows.
      const cx = (r.l + (W - r.rt)) / 2 - W / 2;
      const cy = (r.t + (H - r.b)) / 2 - H / 2;
      media.style.transform = `translate3d(${(cx * (1 - e)).toFixed(1)}px,${(cy * (1 - e)).toFixed(1)}px,0)`;
    }
  };
  const playing = { stress: false, calm: false };
  const playIf = (vid: HTMLVideoElement | null, key: "stress" | "calm", on: boolean) => {
    if (!vid || playing[key] === on) return;
    playing[key] = on;
    if (on) {
      vid.preload = "auto";
      void vid.play().catch(() => undefined);
    } else vid.pause();
  };
  const loaded = new Set<Segment>(["w1"]);
  tl.eventCallback("onUpdate", () => {
    const t = tl.duration() > 0 ? tl.time() / tl.duration() : 0;
    const [seg, p] = frameAt(t);
    if (t > 0.2 && !loaded.has("w2")) {
      loaded.add("w2");
      player.load("w2");
    }
    if (t > 0.5 && !loaded.has("w3")) {
      loaded.add("w3");
      player.load("w3");
    }
    player.set(seg, p);
    portal(Math.max(0, Math.min(1, t / PH.portal[1])));
    playIf(v.stress, "stress", t > PH.pain - 0.01 && t < PH.swap + 0.05);
    playIf(v.calm, "calm", t > PH.swap - 0.01 && t < PH.calmOut + 0.02);
  });
  portal(0);

  // hero → doors
  tl.to(q(".jr-hero"), { opacity: 0, x: -60, duration: 0.03, ease: "power1.in" }, 0.004);
  tl.to(q(".jr-intro"), { opacity: 1, y: 0, duration: 0.015 }, 0.035);
  tl.to(q(".jr-shade"), { opacity: 1, duration: 0.015 }, 0.035);
  tl.to(q(".jr-intro"), { opacity: 0, y: -40, duration: 0.02 }, 0.075);
  tl.to(q(".jr-shade"), { opacity: 0, duration: 0.02 }, 0.08);

  // front desk: drowning
  const vs = [v.stress].filter((x): x is HTMLVideoElement => x !== null);
  const vc = [v.calm].filter((x): x is HTMLVideoElement => x !== null);
  tl.to(vs, { opacity: 1, duration: 0.006, ease: "none" }, PH.pain - 0.004);
  tl.to(q(".jr-light"), { opacity: 1, duration: 0.02 }, PH.pain);
  show(tl, q, ".pn-a", PH.pain + 0.005);
  show(tl, q, ".pn-sa", PH.pain + 0.03);
  show(tl, q, ".jr-foot", PH.pain + 0.03, { y: 0 });
  stagger(tl, q, ".pn-n", PH.pain + 0.045, 0.022, { y: -26, scale: 0.94 });
  show(tl, q, ".pn-book", PH.pain + 0.09, { y: 40, rotate: -7 });
  tl.to(q(".pn-e.x2 s"), { scaleX: 1, duration: 0.02 }, PH.pain + 0.13);
  tl.to(q(".pn-e.x3 s"), { scaleX: 1, duration: 0.02 }, PH.pain + 0.15);

  // same desk: calm
  tl.to(vc, { opacity: 1, duration: 0.035, ease: "sine.inOut" }, PH.swap);
  hide(tl, q, ".pn-n", PH.swap, { y: -14, scale: 0.96 });
  hide(tl, q, ".pn-book", PH.swap, { y: 30 });
  hide(tl, q, ".pn-a", PH.swap + 0.004);
  hide(tl, q, ".pn-sa", PH.swap + 0.004);
  show(tl, q, ".pn-b", PH.swap + 0.02);
  show(tl, q, ".pn-sb", PH.swap + 0.03);
  stagger(tl, q, ".pn-gi", PH.swap + 0.045, 0.016, { x: -24 });
  hide(tl, q, ".pn-b", PH.calmOut - 0.014);
  hide(tl, q, ".pn-sb", PH.calmOut - 0.014);
  hide(tl, q, ".jr-foot", PH.calmOut - 0.014, { y: 0 });
  tl.to(q(".jr-light"), { opacity: 0, duration: 0.025 }, PH.calmOut - 0.01);
  tl.to([...vs, ...vc], { opacity: 0, duration: 0.015, ease: "none" }, PH.calmOut + 0.006);

  // walk to the treatment area → features
  show(tl, q, ".cap-deeper", PH.w2[0], { y: 0 });
  hide(tl, q, ".cap-deeper", PH.w2[1] - 0.03, { y: 0 });
  tl.to(q(".jr-veil"), { opacity: 1, duration: 0.03 }, PH.feat);
  show(tl, q, ".ov-f .t", PH.feat + 0.012);
  show(tl, q, ".ft-lap", PH.feat + 0.022, { x: 80, scale: 0.96 });
  stagger(tl, q, ".ft-i", PH.feat + 0.045, 0.014, { y: 26 });
  hide(tl, q, ".ov-f .t, .ft-lap, .ft-i", PH.featOut);
  tl.to(q(".jr-veil"), { opacity: 0, duration: 0.025 }, PH.featOut + 0.005);

  // walk to the back office → overview
  show(tl, q, ".cap-office", PH.w3[0], { y: 0 });
  hide(tl, q, ".cap-office", PH.w3[1] - 0.03, { y: 0 });
  tl.to(q(".jr-veil"), { opacity: 1, duration: 0.03 }, PH.office);
  show(tl, q, ".of-lap", PH.office + 0.015, { x: -80, scale: 0.96 });
  show(tl, q, ".ov-o .t", PH.office + 0.025);
  stagger(tl, q, ".of-side .card", PH.office + 0.05, 0.022, { y: 26 }, 0.035);
  tl.to({}, { duration: 0.001 }, 0.999);
  return tl;
}

/**
 * Before/after split + time-saved card. Steps highlight, cards appear; counters write text only when the
 * formatted value changes; the ring animates stroke-dashoffset on one circle.
 */
/** Before/after steps one beat per scroll gesture. */
export const BA_STOPS = [0, 0.3, 0.52, 0.74, 1] as const;
export const BA_DURATIONS = [3.2, 2.8, 2.8, 3.0] as const;

export function buildBeforeAfter(tl: TL, q: Q, fmt: (n: number, digits: number) => string) {
  const step = (sel: string, at: number) => {
    tl.to(q(sel), { opacity: 1, scale: 1.02, color: "#221024", duration: 0.05 }, at).to(
      q(sel),
      { scale: 1, duration: 0.03 },
      at + 0.05,
    );
  };
  const card = (sel: string, at: number, from: gsap.TweenVars = { y: 24 }) => {
    tl.fromTo(
      q(sel),
      { opacity: 0, ...from },
      { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.11, ease: "power2.out" },
      at,
    );
  };
  // beat 1 (→ stop 0.3): the message arrives; booked automatically on the right
  step(".bs1", 0.04);
  card(".bc-zalo", 0.05);
  step(".as1", 0.04);
  card(".ac-zalo", 0.05);
  step(".as2", 0.14);
  card(".ac-ok", 0.15, { scale: 0.85 });
  // beat 2 (→ 0.52): notebook vs calendar
  step(".bs2", 0.32);
  card(".bc-book", 0.33, { y: 30, rotate: -3 });
  step(".as3", 0.36);
  card(".ac-cal", 0.38, { y: 40, scale: 0.94 });
  // beat 3 (→ 0.74): call back vs Zalo reminder
  step(".bs3", 0.54);
  card(".bc-call", 0.55);
  step(".as4", 0.58);
  card(".ac-rem", 0.6);
  // beat 4 (→ 1): forgotten vs "I'll come"
  step(".bs4", 0.76);
  card(".bc-forgot", 0.77, { scale: 1.3 });
  step(".as5", 0.8);
  card(".ac-come", 0.82, { scale: 0.85 });

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
      duration: 0.9,
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
    tl.fromTo(
      ring,
      { strokeDashoffset: c },
      { strokeDashoffset: c * 0.22, duration: 0.9, ease: "none" },
      0.04,
    );
  }
  tl.to({}, { duration: 0.001 }, 0.999);
}
