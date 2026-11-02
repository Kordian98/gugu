import { gsap } from "gsap";

/** Appointment slots inside the laptop calendar capture (fractions of the glass), targets for the Zalo bubbles. */
export const SLOTS = [
  { x: 0.13, y: 0.48, w: 0.19, h: 0.09 },
  { x: 0.34, y: 0.3, w: 0.19, h: 0.09 },
  { x: 0.55, y: 0.58, w: 0.19, h: 0.09 },
  { x: 0.76, y: 0.4, w: 0.19, h: 0.09 },
  { x: 0.13, y: 0.72, w: 0.19, h: 0.09 },
];

/** Builds the scrubbed master timeline (units ≈ scroll distance). transform/opacity only. */
/** forEach that ignores the callback's return value (GSAP timelines are thenables). */
const each = (els: HTMLElement[], fn: (el: HTMLElement, i: number) => unknown) => {
  els.forEach((el, i) => {
    fn(el, i);
  });
};

export function buildTimeline(root: HTMLElement, scroller: Element) {
  const q = gsap.utils.selector(root);
  const mid = root.querySelector<HTMLElement>(".st-mid");
  const midW = () => mid?.clientWidth ?? 1000;
  const midH = () => mid?.clientHeight ?? 625;
  const head = (i: number) => q(`.st-head[data-i="${String(i)}"]`);
  const ease = "power2.inOut";

  gsap.set(q(".st-head"), { opacity: 0, y: 30, scale: 0.97 });
  gsap.set(q(".st-bub"), { opacity: 0 });
  gsap.set(q(".st-reception,.st-rooms"), { opacity: 0, scale: 0.94 });

  const tl = gsap.timeline({
    defaults: { ease, duration: 1.5 },
    scrollTrigger: {
      trigger: root,
      scroller,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });
  const inHead = (i: number, at: number) => {
    tl.to(head(i), { opacity: 1, y: 0, scale: 1, duration: 1.4 }, at);
  };
  const outHead = (i: number, at: number) => {
    tl.to(head(i), { opacity: 0, y: -24, scale: 0.98, duration: 1.2 }, at);
  };

  // 0 · Entrance: doors open, a gentle camera push (never above the shot's native resolution).
  inHead(0, 0);
  tl.to(q(".st-door.l"), { rotateY: -96, duration: 4 }, 1.5).to(
    q(".st-door.r"),
    { rotateY: 96, duration: 4 },
    1.5,
  );
  tl.to(q(".st-door"), { opacity: 0, duration: 1 }, 4.6);
  tl.fromTo(q(".st-entrance"), { scale: 0.92 }, { scale: 1, duration: 8, ease: "none" }, 0);
  outHead(0, 8.2);

  // 1 · Reception chaos: Zalo messages pile up.
  tl.to(q(".st-veil"), { opacity: 0.94, duration: 2 }, 9.5);
  tl.to(q(".st-reception"), { opacity: 1, scale: 1, duration: 2 }, 10);
  inHead(1, 10.5);
  each(q(".st-bub"), (b, i) =>
    tl.fromTo(
      b,
      { opacity: 0, x: i % 2 ? 60 : -60, y: 20 },
      { opacity: 1, x: 0, y: 0, duration: 1.2, ease: "power3.out" },
      11.5 + i * 1,
    ),
  );
  tl.fromTo(
    q(".st-badge"),
    { opacity: 0, scale: 0.6 },
    { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" },
    16.5,
  );
  outHead(1, 20);

  // 2 · Notebook: double booking, no-show, forgotten reminder.
  tl.to(q(".st-reception"), { opacity: 0, scale: 0.97, duration: 1.6 }, 21.5);
  tl.to(q(".st-bub,.st-badge"), { y: -midH() * 0.08, opacity: 0.55, duration: 1.6 }, 21.5);
  inHead(2, 22);
  tl.fromTo(
    q(".st-book"),
    { opacity: 0, scale: 0.9, rotate: -4 },
    { opacity: 1, scale: 1, rotate: -2, duration: 2 },
    22.5,
  );
  each(q(".st-stamp"), (s, i) =>
    tl.fromTo(
      s,
      { opacity: 0, scale: 1.35 },
      { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" },
      25.5 + i * 1.6,
    ),
  );
  outHead(2, 32);

  // 3 · The notebook becomes the calendar; messages fly into appointments.
  inHead(3, 34);
  tl.to(q(".st-stamp,.st-badge"), { opacity: 0, duration: 1 }, 33.5);
  tl.fromTo(
    q(".st-laptop"),
    { opacity: 0, scale: 0.82 },
    { opacity: 1, scale: 1, duration: 3 },
    34,
  );
  tl.to(q(".st-book"), { scale: 0.55, opacity: 0, rotate: 0, duration: 2.6 }, 34.5);
  each(q(".st-bub"), (b, i) => {
    const s = SLOTS[i % SLOTS.length] ?? { x: 0.5, y: 0.5, w: 0.2, h: 0.1 };
    tl.to(
      b,
      {
        x: () => s.x * midW() - (b.offsetLeft + b.offsetWidth / 2) + s.w * midW() * 0.5,
        y: () => s.y * midH() - (b.offsetTop + b.offsetHeight / 2) + s.h * midH() * 0.5,
        scale: 0.35,
        opacity: 0,
        duration: 2.2,
      },
      37 + i * 0.5,
    );
  });
  each(q(".st-slot"), (s, i) =>
    tl.fromTo(
      s,
      { opacity: 0, scale: 0.6 },
      { opacity: 0.85, scale: 1, duration: 0.8, ease: "power3.out" },
      38.6 + i * 0.5,
    ),
  );
  tl.to(q(".st-slot"), { opacity: 0, duration: 1 }, 44);
  outHead(3, 44.5);

  // 4 · Treatment rooms: staff at work while reminders send themselves.
  tl.to(q(".st-laptop"), { opacity: 0, scale: 0.94, duration: 1.6 }, 46);
  tl.to(q(".st-rooms"), { opacity: 1, scale: 1, duration: 2 }, 46.2);
  inHead(4, 46.5);
  tl.fromTo(
    q(".st-phone"),
    { opacity: 0, y: () => midH() * 0.5 },
    { opacity: 1, y: 0, duration: 2.4, ease: "power3.out" },
    48,
  );
  tl.to(q(".st-pane.rem"), { opacity: 1, duration: 1 }, 49.5);
  outHead(4, 55);

  // 5 · Calm reception: ask the AI assistant (Pro).
  tl.to(q(".st-rooms"), { opacity: 0, scale: 0.97, duration: 1.6 }, 56.5);
  tl.to(q(".st-laptop"), { opacity: 1, scale: 1, duration: 2 }, 57);
  tl.to(q(".st-pane.rem"), { opacity: 0, duration: 0.8 }, 57);
  inHead(5, 57.5);
  tl.to(q(".st-pane.ai"), { opacity: 1, duration: 0.8 }, 58);
  each(q(".st-pane.ai .st-b, .st-pane.ai .st-chip"), (b, i) =>
    tl.fromTo(b, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.9 }, 59 + i * 1.6),
  );
  outHead(5, 66.5);

  // 6 · From Zalo to booked.
  tl.to(q(".st-pane.ai"), { opacity: 0, duration: 0.8 }, 68);
  tl.to(q(".st-pane.fin"), { opacity: 1, duration: 0.8 }, 68.4);
  inHead(6, 68.5);
  each(q(".st-pane.fin .st-b"), (b, i) =>
    tl.fromTo(b, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.9 }, 69.5 + i * 1.7),
  );
  tl.fromTo(
    q(".st-newbook"),
    { opacity: 0, scale: 0.6 },
    { opacity: 1, scale: 1, duration: 0.9, ease: "power3.out" },
    75.5,
  );
  outHead(6, 78.5);

  // 7 · Calm: the whole day at a glance.
  inHead(7, 80);
  tl.to(q(".st-img-overview"), { opacity: 1, duration: 1.6 }, 80);
  tl.to(q(".st-newbook"), { opacity: 0, duration: 0.8 }, 80);
  tl.fromTo(q(".st-card.kpi"), { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 2 }, 81);
  tl.fromTo(q(".st-card.client"), { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 2 }, 82);
  outHead(7, 88.5);

  // 8 · Switching: price list photo → recognised services → your catalogue.
  tl.to(q(".st-laptop,.st-phone,.st-card"), { opacity: 0, scale: 0.96, duration: 1.6 }, 89.5);
  inHead(8, 90);
  tl.to(q(".st-sw"), { opacity: 1, duration: 0.5 }, 90.5);
  tl.fromTo(
    q(".st-plist"),
    { opacity: 0, x: -60, rotate: -6 },
    { opacity: 1, x: 0, rotate: -2, duration: 2 },
    90.5,
  );
  tl.fromTo(
    q(".st-cat"),
    { opacity: 0, scale: 0.95 },
    { opacity: 1, scale: 1, duration: 1.6 },
    92.5,
  );
  each(q(".st-row"), (r, i) =>
    tl.fromTo(r, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 1 }, 93.5 + i * 0.9),
  );
  tl.to(q(".st-eff"), { opacity: 1, duration: 1 }, 97.5);
  tl.to({}, { duration: 2.5 }, 98.5);
  return tl;
}
