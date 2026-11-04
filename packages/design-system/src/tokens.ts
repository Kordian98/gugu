/**
 * Lilac Glow design tokens (docs/tasks/02-design-system.md §3.2). Expressive surfaces are light-only (X18).
 * Single source of truth: the app's Tailwind theme (apps/app/global.css @theme) mirrors these values.
 */
export const color = {
  canvas: "#FDFAF7",
  ink: "#221024",
  ink2: "#3B2237",
  body: "#5E4659",
  muted: "#7A6A80",
  white: "#FFFFFF",
  line: "#EEE6E4",
  lineSoft: "#EFE8E6",
  tile: "#F7F2EE",
  tileActiveFrom: "#D9C8FD",
  tileActiveTo: "#C8B2FA",
  lilac100: "#EEE7FC",
  lilac300: "#CDBBF5",
  lilac500: "#A98BEB",
  lilac700: "#7B5CCB",
  eyebrow: "#855AA1",
  pink300: "#F6B8CC",
  rose500: "#EE8FB0",
  script: "#F29BBF",
  peach400: "#F6A88A",
  gold400: "#D8B06A",
  plum950: "#2A1426",
  inkButtonTop: "#2E1830",
  inkButtonBottom: "#1F0E21",
  star: "#F0A93B",
  neon: "#FFE6F0",
  neonGlow: "#F57DB2",
  /** Pain / "before" accents (landing story) — on white or canvas only. */
  danger: "#C2414B",
  dangerInk: "#9A3B44",
  dangerTint: "#FDE2E4",
  /** Zalo brand blue, only for Zalo message chips. */
  zalo: "#0068FF",
  /** Zalo chat surfaces (client-perspective phone mock only). */
  zaloChat: "#E4E9F0",
  zaloSent: "#D5E6FF",
  /** Paper props in illustrations (notebook, price list) and spreadsheet cells. */
  paper: "#FFFBEF",
  paperLine: "#EADFC2",
  sheet: "#EEF3EC",
  sheetLine: "#DCE6D8",
} as const;

export const gradient = {
  /** "here." in the hero headline */
  glowHere: ["#A68CF6", "#C99BEA", "#FD909F"],
  /** "glow-up." */
  glowUp: ["#6F55C9", "#B58BEA", "#F69BB3", "#F8A27C"],
  /** Two-stop lilac → pink used for big numbers and progress fills (≤ 2 headline words). */
  glowSoft: ["#A68CF6", "#F08DB4"],
} as const;

/** CSS linear-gradient from a gradient token. */
export const cssGradient = (stops: readonly string[], angle = "90deg") =>
  `linear-gradient(${angle},${stops.join(",")})`;

/**
 * Motion tokens (design-system skill: fast 120 · base 200 · slow 320 · deliberate 500 ms). Expressive
 * surfaces only; calm surfaces use fast/base without springs. Honour reduced motion everywhere.
 */
export const motion = {
  duration: { fast: 120, base: 200, slow: 320, deliberate: 500 },
  ease: {
    out: "cubic-bezier(.2,.7,.2,1)",
    inOut: "cubic-bezier(.45,0,.55,1)",
    /** strong in-out for a before → after wipe */
    wipe: "cubic-bezier(.65,0,.35,1)",
  },
  /** Expressive landing story (phones): page fade, before/after wipe, walk-in, first-view hint (ms). */
  story: { page: 240, toast: 2600, wipe: 1100, walk: 2600, hint: 4200, hintDelay: 600 },
} as const;

/**
 * Type scale (px) for expressive web CSS (landing story). Body text never below `body`; `caption` and
 * `micro` only for labels, counters and footnotes.
 */
export const typeScale = {
  micro: 12,
  caption: 13,
  label: 14,
  body: 16,
  lead: 18,
  title: 22,
  numeral: 30,
  stat: 46,
  display: 40,
} as const;

/** Translucent layers (ink / paper / white at fixed alpha) for scrims, veils, glass and toasts. */
export const overlay = {
  ink95: "rgba(34,16,36,.95)",
  ink85: "rgba(34,16,36,.85)",
  scrim: "rgba(34,16,36,.34)",
  ink14: "rgba(34,16,36,.14)",
  ink10: "rgba(34,16,36,.10)",
  ink0: "rgba(34,16,36,0)",
  paper94: "rgba(253,250,247,.94)",
  paper86: "rgba(253,250,247,.86)",
  paper78: "rgba(253,250,247,.78)",
  paper0: "rgba(253,250,247,0)",
  glass: "rgba(255,255,255,.97)",
  white35: "rgba(255,255,255,.35)",
  white14: "rgba(255,255,255,.14)",
  white0: "rgba(255,255,255,0)",
} as const;

/** Elevation for expressive web CSS. */
export const shadow = {
  card: "0 18px 50px rgba(42,20,38,.22)",
  soft: "0 14px 40px rgba(42,20,38,.12)",
  toast: "0 12px 30px rgba(34,16,36,.30)",
  chip: "0 8px 20px rgba(34,16,36,.25)",
  hair: "0 1px 2px rgba(34,16,36,.06)",
  lift: "0 -8px 30px rgba(42,20,38,.08)",
  thumb: "0 4px 12px rgba(42,20,38,.20)",
  glow: "0 0 18px 4px rgba(169,139,235,.75)",
} as const;

/** Font families registered by the app (expo-font keys = family names). */
export const font = {
  ui: "BeVietnamPro-Regular",
  uiMedium: "BeVietnamPro-Medium",
  uiSemiBold: "BeVietnamPro-SemiBold",
  display: "NotoSerifDisplay-CondensedHeavy",
  serifBold: "NotoSerifDisplay-Bold",
  serif: "NotoSerifDisplay-Regular",
  script: "PatrickHand-Regular",
  neon: "BarlowCondensed-Regular",
} as const;

export const radius = { sm: 12, md: 16, lg: 24, xl: 28, pill: 999 } as const;

export const breakpoint = { desktop: 900 } as const;

export type ColorToken = keyof typeof color;
