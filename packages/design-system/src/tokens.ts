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
} as const;

export const gradient = {
  /** "here." in the hero headline */
  glowHere: ["#A68CF6", "#C99BEA", "#FD909F"],
  /** "glow-up." */
  glowUp: ["#6F55C9", "#B58BEA", "#F69BB3", "#F8A27C"],
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
