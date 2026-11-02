import { gsap } from "gsap";

/** Scrubbed before/after timeline: transform/opacity only; the counter writes text only when its value changes. */
export function buildBeforeAfter(
  root: HTMLElement,
  scroller: Element,
  savedEl: HTMLElement | null,
) {
  const q = gsap.utils.selector(root);
  const counter = { v: 0 };
  let shown = -1;
  const tl = gsap.timeline({
    defaults: { ease: "power2.out", duration: 1 },
    scrollTrigger: {
      trigger: root,
      scroller,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.5,
      invalidateOnRefresh: true,
    },
  });
  const step = (sel: string, at: number) => {
    tl.to(q(sel), { opacity: 1, scale: 1.02, color: "#221024", duration: 0.6 }, at).to(
      q(sel),
      { scale: 1, duration: 0.4 },
      at + 0.6,
    );
  };
  const card = (sel: string, at: number, from: gsap.TweenVars = { y: 24 }) => {
    tl.fromTo(
      q(sel),
      { opacity: 0, ...from },
      { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.9 },
      at,
    );
  };
  // Before (left)
  step(".bs1", 0.2);
  card(".bc-zalo", 0.2);
  step(".bs2", 1.6);
  card(".bc-book", 1.6, { y: 30, rotate: -3 });
  step(".bs3", 3.0);
  card(".bc-call", 3.0);
  step(".bs4", 4.4);
  card(".bc-forgot", 4.4, { scale: 1.3 });
  // After (right), running in parallel
  step(".as1", 0.2);
  card(".ac-zalo", 0.2);
  step(".as2", 1.2);
  card(".ac-ok", 1.2, { scale: 0.85 });
  step(".as3", 2.2);
  card(".ac-cal", 2.2, { y: 40, scale: 0.94 });
  step(".as4", 3.4);
  card(".ac-rem", 3.4);
  step(".as5", 4.4);
  card(".ac-come", 4.4, { scale: 0.85 });
  tl.to(
    counter,
    {
      v: 18,
      duration: 5,
      ease: "none",
      onUpdate: () => {
        const n = Math.round(counter.v);
        if (n !== shown && savedEl) {
          shown = n;
          savedEl.textContent = String(n);
        }
      },
    },
    0.2,
  );
  tl.to({}, { duration: 1 }, 5.4);
  return tl;
}
