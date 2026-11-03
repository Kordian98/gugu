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
  portal: [0, 0.045],
  w1: [0.045, 0.153],
  desk: 0.153,
  wipe: 0.306,
  deskOut: 0.432,
  w2: [0.45, 0.558],
  feat: 0.558,
  featOut: 0.67,
  w3: [0.688, 0.788],
  office: 0.788,
  officeOut: 0.885,
  sw: 0.9,
} as const;

/** Scenes one gesture steps between: hero · before · after · treatment area · office · switching. */
export const STOPS = [0, 0.297, 0.41, 0.662, 0.876, 1] as const;
/** Seconds per transition: door + walk + "before", before→after wipe, walk + features, walk + office, switching. */
export const DURATIONS = [7.0, 3.4, 6.2, 6.0, 3.6] as const;

/** Which walk frame to show at journey time t. */
function frameAt(t: number): [Segment, number] {
  const lin = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  if (t < PH.w1[1]) return ["w1", lin(PH.w1[0], PH.w1[1])];
  // Under the split the canvas switches to the calm frame, so leaving the desk reveals walk 2's start.
  if (t < PH.wipe + 0.07) return ["w1", 1];
  if (t < PH.w2[1]) return ["w2", lin(PH.w2[0], PH.w2[1])];
  if (t < PH.w3[0]) return ["w2", 1];
  return ["w3", lin(PH.w3[0], PH.w3[1])];
}

/**
 * The single-scene journey: arched door portal (hero) → full-bleed walk in → front desk drowning → calm
 * (same receptionist, matching 16:9 loops) → walk to the treatment area (features) → walk to the back
 * office (overview, stat, assistant). Canvas frame, loop playback and the portal clip are driven from the
 * smoothed timeline time; everything else is transform/opacity.
 */
export function buildJourney(
  root: HTMLElement,
  q: Q,
  player: WalkPlayer,
  hud: HTMLElement | null,
  locale: string,
) {
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
      ? { t: H * 0.5, rt: W * 0.05, b: H * 0.1, l: W * 0.05 }
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
      // + a little extra so the shop sign above the doors sits fully inside the arch.
      const cy = (r.t + (H - r.b)) / 2 - H / 2 + H * (mobile ? 0.27 : 0.1);
      media.style.transform = `translate3d(${(cx * (1 - e)).toFixed(1)}px,${(cy * (1 - e)).toFixed(1)}px,0)`;
    }
  };
  // HUD: per-chapter fill (transition progress into chapter i), active chapter, next-button label.
  const fills = hud ? Array.from(hud.querySelectorAll<HTMLElement>(".hud-fill")) : [];
  const steps = hud ? Array.from(hud.querySelectorAll<HTMLElement>(".hud-s")) : [];
  let lastHud = "";
  const syncHud = (t: number) => {
    if (!hud) return;
    const key = t.toFixed(3);
    if (key === lastHud) return;
    lastHud = key;
    let active = 0;
    STOPS.forEach((s0, i) => {
      if (t >= s0 - 0.003) active = i;
    });
    fills.forEach((el) => {
      const i = Number(el.dataset["stop"] ?? 0);
      const s0 = STOPS[i] ?? 0;
      const prev = STOPS[i - 1] ?? 0;
      const f = i === 0 ? 1 : Math.max(0, Math.min(1, (t - prev) / (s0 - prev)));
      el.style.transform = `scaleX(${f.toFixed(3)})`;
    });
    steps.forEach((el) => {
      const stops = (el.dataset["stops"] ?? "").split(",").map(Number);
      el.classList.toggle("on", stops.includes(active));
    });
    hud.dataset["at"] = t < 0.003 ? "start" : t > 0.997 ? "end" : active === 1 ? "before" : "mid";
  };
  // Counters (write text only when the shown value changes).
  const counter = (sel: string, to: number, at: number, dur: number, digits = 0) => {
    const el = q(sel)[0] as HTMLElement | undefined;
    if (!el) return;
    const v = { n: 0 };
    let shown = "";
    tl.fromTo(
      v,
      { n: 0 },
      {
        n: to,
        duration: dur,
        ease: "power1.out",
        onUpdate: () => {
          const s = v.n >= to - 0.001 ? String(to) : v.n.toFixed(digits);
          if (s !== shown) {
            shown = s;
            el.textContent = s;
          }
        },
      },
      at,
    );
  };
  const loaded = new Set<Segment>(["w1"]);
  tl.eventCallback("onUpdate", () => {
    const t = tl.duration() > 0 ? tl.time() / tl.duration() : 0;
    const [seg, p] = frameAt(t);
    if (t > 0.2 && !loaded.has("w2")) {
      loaded.add("w2");
      player.load("w2");
    }
    if (t > 0.4 && !loaded.has("w3")) {
      loaded.add("w3");
      player.load("w3");
    }
    player.set(seg, p);
    portal(Math.max(0, Math.min(1, t / PH.portal[1])));
    syncHud(t);
  });
  portal(0);
  syncHud(0);

  // hero → doors
  tl.to(q(".jr-hero"), { opacity: 0, x: -60, duration: 0.03, ease: "power1.in" }, 0.004);
  tl.to(q(".jr-intro"), { opacity: 1, y: 0, duration: 0.015 }, 0.035);
  tl.to(q(".jr-shade"), { opacity: 1, duration: 0.015 }, 0.035);
  tl.to(q(".jr-intro"), { opacity: 0, y: -40, duration: 0.02 }, 0.075);
  tl.to(q(".jr-shade"), { opacity: 0, duration: 0.02 }, 0.08);

  // front desk "before": the frozen, whitened frame with the drowning content
  const D0 = PH.desk;
  const spEl = q(".sp")[0];
  if (spEl) tl.set(spEl, { "--x": "100%" }, 0);
  tl.fromTo(q(".sp"), { opacity: 0 }, { opacity: 1, duration: 0.02, ease: "sine.inOut" }, D0);
  tl.to(q(".sp-veil"), { opacity: 1, duration: 0.03, ease: "sine.inOut" }, D0 + 0.012);
  show(tl, q, ".sp-tag.b", D0 + 0.035, { y: -10, scale: 0.8 });
  show(tl, q, ".sp-ui-l .sp-head", D0 + 0.04, { y: 50 });
  show(tl, q, ".sp-ui-l .pn-stat", D0 + 0.055, { y: 30, scale: 0.9 });
  counter(".pn-num", 3, D0 + 0.055, 0.05, 1);
  show(tl, q, ".pn-badge", D0 + 0.07, { y: -10, scale: 0.6 });
  counter(".pn-count", 12, D0 + 0.072, 0.08);
  stagger(tl, q, ".sp-steps.b li", D0 + 0.065, 0.014, { x: -20 }, 0.02);
  stagger(tl, q, ".pn-n", D0 + 0.075, 0.016, { y: -20, scale: 0.94 });
  show(tl, q, ".pn-book", D0 + 0.1, { y: 30, rotate: -7 });
  tl.to(q(".pn-e.x2 s"), { scaleX: 1, duration: 0.012 }, D0 + 0.125);
  tl.to(q(".pn-e.x3 s"), { scaleX: 1, duration: 0.012 }, D0 + 0.138);
  show(tl, q, ".jr-foot", D0 + 0.05, { y: 0 });

  // before → after: the divider sweeps across the WHOLE screen; left of it is still "before"
  // (photo + content), right of it is already "after". The handle can also be dragged.
  const W = PH.wipe;
  tl.to(q(".sp-line, .sp-knob"), { opacity: 1, duration: 0.008 }, W - 0.004);
  if (spEl)
    tl.fromTo(spEl, { "--x": "100%" }, { "--x": "0%", duration: 0.055, ease: "power2.inOut" }, W);
  tl.to(q(".sp-line, .sp-knob"), { opacity: 0, duration: 0.01 }, W + 0.055);
  show(tl, q, ".sp-tag.a", W + 0.004, { y: -10, scale: 0.8 }, 0.02);
  show(tl, q, ".sp-ui-r .sp-head", W + 0.01, { y: 40 }, 0.03);
  show(tl, q, ".pn-calm", W + 0.02, { y: 20 }, 0.03);
  q(".pn-gi").forEach((el, i) => {
    tl.fromTo(
      el,
      { opacity: 0, x: -24, scale: 0.8 },
      { opacity: 1, x: 0, scale: 1, duration: 0.022, ease: "back.out(2.2)" },
      W + 0.03 + i * 0.012,
    );
  });
  q(".sp-gain").forEach((el, i) => {
    tl.fromTo(
      el,
      { opacity: 0, y: 26, scale: 0.85 },
      { opacity: 1, y: 0, scale: 1, duration: 0.025, ease: "back.out(1.8)" },
      W + 0.045 + i * 0.012,
    );
  });
  show(tl, q, ".sp-cal", W + 0.03, { y: 30, scale: 0.94 }, 0.03);
  show(tl, q, ".sp-booked", W + 0.05, { y: -10, scale: 0.6 }, 0.02);
  show(tl, q, ".sp-rem", W + 0.06, { y: 20 }, 0.025);
  show(tl, q, ".sp-come", W + 0.075, { scale: 0.6 }, 0.02);
  show(tl, q, ".sp-app .sv", W + 0.045, { y: 30 }, 0.03);
  const nf = (d: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const saved: [string, number, number][] = [
    [".sv-num", 6.5, 1],
    [".sv-r1", 38, 0],
    [".sv-r2", 21, 0],
    [".sv-r3", 24, 0],
  ];
  saved.forEach(([sel, to, d]) => {
    const el = q(sel)[0] as HTMLElement | undefined;
    if (!el) return;
    const v = { n: 0 };
    let last = "";
    const f = nf(d);
    tl.fromTo(
      v,
      { n: 0 },
      {
        n: to,
        duration: 0.06,
        ease: "power1.out",
        onUpdate: () => {
          const str = f.format(v.n);
          if (str !== last) {
            last = str;
            el.textContent = str;
          }
        },
      },
      W + 0.05,
    );
  });
  const ring = q(".sv-ring .fg")[0];
  if (ring) {
    const c = 2 * Math.PI * 40;
    tl.fromTo(
      ring,
      { strokeDashoffset: c },
      { strokeDashoffset: c * 0.22, duration: 0.06, ease: "power1.out" },
      W + 0.05,
    );
  }
  // leave the desk: the scene fades to the calm frame (walk 2 starts there)
  tl.to(q(".sp"), { opacity: 0, duration: 0.02, ease: "sine.inOut" }, PH.deskOut - 0.012);

  // walk to the treatment area → features
  show(tl, q, ".cap-deeper", PH.w2[0], { y: 0 });
  hide(tl, q, ".cap-deeper", PH.w2[1] - 0.03, { y: 0 });
  tl.to(q(".jr-veil"), { opacity: 1, duration: 0.03 }, PH.feat);
  show(tl, q, ".ov-f .t", PH.feat + 0.012, { y: 60 });
  // pain → gain rows: the row lands, the pain line dims, the gain + number pop
  q(".fx").forEach((el, i) => {
    const at = PH.feat + 0.035 + i * 0.016;
    tl.fromTo(
      el,
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.025, ease: "power2.out" },
      at,
    );
    const n = el.querySelector(".fx-n");
    const g = el.querySelector(".fx-g");
    const pn = el.querySelector(".fx-p");
    if (n)
      tl.fromTo(
        n,
        { opacity: 0, scale: 0.5 },
        { opacity: 1, scale: 1, duration: 0.02, ease: "back.out(2.4)" },
        at + 0.012,
      );
    if (g) tl.fromTo(g, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.018 }, at + 0.014);
    if (pn) tl.to(pn, { opacity: 0.55, duration: 0.015 }, at + 0.02);
  });
  show(tl, q, ".fx-facts", PH.feat + 0.1, { y: 10 }, 0.02);
  stagger(tl, q, ".fx-scr", PH.feat + 0.02, 0.016, { y: 30, scale: 0.94 }, 0.028);
  show(tl, q, ".ft-chip", PH.feat + 0.07, { y: 14, scale: 0.7 });
  hide(tl, q, ".ov-f .t, .fx, .fx-facts, .ft-chip, .fx-scr", PH.featOut);
  tl.to(q(".jr-veil"), { opacity: 0, duration: 0.025 }, PH.featOut + 0.005);

  // walk to the back office → overview
  show(tl, q, ".cap-office", PH.w3[0], { y: 0 });
  hide(tl, q, ".cap-office", PH.w3[1] - 0.03, { y: 0 });
  tl.to(q(".jr-veil"), { opacity: 1, duration: 0.03 }, PH.office);
  show(tl, q, ".of-lap", PH.office + 0.015, { x: -80, scale: 0.96 });
  show(tl, q, ".ov-o .t", PH.office + 0.025, { y: 60 });
  stagger(tl, q, ".of-side .card", PH.office + 0.045, 0.02, { y: 26 }, 0.03);
  hide(tl, q, ".of-lap, .ov-o .t, .of-side .card", PH.officeOut);

  // switching: still in the office — the AI reads the price list and fills the services screen
  const SW = PH.sw;
  show(tl, q, ".ov-s .t", SW, { y: 50 }, 0.025);
  stagger(tl, q, ".sw-steps li", SW + 0.012, 0.01, { x: -20 }, 0.02);
  show(tl, q, ".sw-list", SW + 0.008, { y: 30, rotate: -6 }, 0.025);
  show(tl, q, ".sw-win", SW + 0.016, { x: 40, scale: 0.96 }, 0.025);
  tl.fromTo(
    q(".sw-scan"),
    { yPercent: -100, opacity: 1 },
    { yPercent: 900, duration: 0.04, ease: "none" },
    SW + 0.025,
  );
  tl.to(q(".sw-scan"), { opacity: 0, duration: 0.005 }, SW + 0.066);
  tl.fromTo(
    q(".sw-fill"),
    { scaleX: 0 },
    { scaleX: 1, duration: 0.06, ease: "power1.inOut" },
    SW + 0.025,
  );
  q(".sw-row").forEach((row, i) => {
    const at = SW + 0.03 + i * 0.012;
    const sk = row.querySelector(".sw-sk");
    const val = row.querySelector(".sw-val");
    const knob = row.querySelector(".sw-tog i");
    const tog = row.querySelector(".sw-tog");
    tl.fromTo(row, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.012 }, at);
    if (sk && val) {
      tl.to(sk, { opacity: 0, duration: 0.01 }, at + 0.02);
      tl.fromTo(val, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.012 }, at + 0.02);
    }
    if (knob && tog) {
      tl.to(knob, { x: 14, duration: 0.01, ease: "back.out(2)" }, at + 0.03);
      tl.to(tog, { backgroundColor: "#A98BEB", duration: 0.01 }, at + 0.03);
    }
  });
  tl.to(q(".sw-status .s1"), { opacity: 0, duration: 0.01 }, SW + 0.085);
  tl.fromTo(
    q(".sw-status .s2"),
    { opacity: 0, y: 6 },
    { opacity: 1, y: 0, duration: 0.012 },
    SW + 0.087,
  );
  tl.to({}, { duration: 0.001 }, 0.999);
  return tl;
}
