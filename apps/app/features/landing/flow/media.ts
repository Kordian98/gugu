/**
 * Photoreal media for the web flow, served from apps/app/public/studio (not bundled by Metro). Generated
 * with fal (see design/hero/PROMPTS.md, LICENSES.md); illustrative people, never customers. Sizes are kept
 * at or above the largest on-screen size (≤1.15× rule).
 */
export const PHOTO = {
  stress: "/studio/photo/stress.webp",
  calm: "/studio/photo/calm.webp",
  /** 16:9 crops matching the walk frames (video posters). */
  stress169: "/studio/photo/stress-169.webp",
  calm169: "/studio/photo/calm-169.webp",
  exterior: "/studio/photo/exterior.webp",
  phone: "/studio/photo/phone.webp",
  customer: "/studio/photo/customer.webp",
  nails: "/studio/photo/nails.webp",
  hair: "/studio/photo/hair.webp",
  barber: "/studio/photo/barber.webp",
  spa: "/studio/photo/spa.webp",
  lash: "/studio/photo/lash.webp",
  brow: "/studio/photo/brow.webp",
} as const;

/** 5 s seamless loops in the walk's 16:9 framing (desktop 3200 px) and portrait crops (mobile 960 px). */
export const LOOP = {
  stress: "/studio/loop/stress.mp4",
  calm: "/studio/loop/calm.mp4",
  stressM: "/studio/loop/stress-m.mp4",
  calmM: "/studio/loop/calm-m.mp4",
} as const;
