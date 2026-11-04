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
  /** Control boundaries that must reach 3:1 (WCAG 1.4.11) on white, canvas and tile: chips, steppers. */
  lineStrong: "#8E7B8A",
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
  /**
   * Deep glow for gradient text that must stay readable: every stop ≥ 4.3:1 on canvas/white, so it
   * passes AA for large text only (≥ 24 px, or ≥ 18.66 px bold). Never use it for body text.
   */
  glowInk: ["#7B5CCB", "#A0529E", "#C04F7E"],
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
  ease: { out: "cubic-bezier(.2,.7,.2,1)", inOut: "cubic-bezier(.45,0,.55,1)" },
  /** The same curves as control points, for JS animations (`Easing.bezier(...motion.bezier.out)`). */
  bezier: { out: [0.2, 0.7, 0.2, 1], inOut: [0.45, 0, 0.55, 1] },
  /** RN `Animated.spring` presets. `pop` overshoots slightly: expressive only, never calm mode. */
  spring: { pop: { friction: 5, tension: 160 } },
} as const;

/** Opacity tokens. */
export const opacity = { backdrop: 0.42, disabled: 0.4 } as const;

/** Elevation presets (RN shadow props; react-native-web maps them to box-shadow). */
export const shadow = {
  /** Floating result / feature cards. */
  card: {
    shadowColor: color.lilac700,
    shadowOpacity: 0.14,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
  },
  /** Selected segment, small raised controls. */
  raised: {
    shadowColor: color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
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

/** Spacing scale (4 px base). Use for gaps and padding instead of ad-hoc numbers. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40 } as const;

export const radius = { sm: 12, md: 16, lg: 24, xl: 28, pill: 999 } as const;

export const breakpoint = { desktop: 900 } as const;

export type ColorToken = keyof typeof color;
