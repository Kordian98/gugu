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
  ease: {
    out: "cubic-bezier(.2,.7,.2,1)",
    inOut: "cubic-bezier(.45,0,.55,1)",
    /** strong in-out for a before → after wipe */
    wipe: "cubic-bezier(.65,0,.35,1)",
  },
  /** The same curves as control points, for JS animations (`Easing.bezier(...motion.bezier.out)`). */
  bezier: { out: [0.2, 0.7, 0.2, 1], inOut: [0.45, 0, 0.55, 1] },
  /** RN `Animated.spring` presets. `pop` overshoots slightly: expressive only, never calm mode. */
  spring: { pop: { friction: 5, tension: 160 } },
  /**
   * Expressive landing story (phones): page fade, before/after wipe, walk-in, first-view hint, and the
   * switching page's AI setup (price-list scan sweep, then one services row every `row`), and the
   * phone intro's doors (the hero's arched window grows to the full screen before the walk-in) (ms).
   */
  story: {
    page: 240,
    doors: 1200,
    toast: 2600,
    wipe: 1100,
    walk: 2600,
    hint: 4200,
    hintDelay: 600,
    scan: 1300,
    row: 180,
  },
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
  paper10: "rgba(253,250,247,.10)",
  paper0: "rgba(253,250,247,0)",
  glass: "rgba(255,255,255,.97)",
  white35: "rgba(255,255,255,.35)",
  white14: "rgba(255,255,255,.14)",
  white0: "rgba(255,255,255,0)",
} as const;

/**
 * Frosted chips (case-study zoom icon, desktop and phones) and the shared refraction edge. `dark` is the
 * zoom viewer's glass on ink. The phone story uses `liquidGlass` below.
 */
export const glass = {
  /** Small frosted chip on a screenshot (case studies). */
  chip: "rgba(255,255,255,.80)",
  /** Refraction edge: bright rim fading out across the surface. */
  edge: "rgba(255,255,255,.95)",
  edgeSoft: "rgba(255,255,255,.18)",
  dark: "rgba(255,255,255,.16)",
  darkEdge: "rgba(255,255,255,.34)",
  blurChip: 18,
  saturate: 1.8,
} as const;

/**
 * Liquid glass (phone landing story, iOS 26 style; owner 2026-11-05): a LOW white tint over a strongly
 * blurred, saturated, slightly brightened backdrop, so the photo or film behind shows through as colour
 * and shape. A 1 px specular rim on top, a gradient refraction border, an inner sheen and a faint inner
 * shade at the bottom give it thickness.
 *
 * Legibility never comes from the opacity of the whole panel: text blocks sit on a local, feathered
 * `veil` inside the glass. Panel + veil over a BLACK backdrop still gives ink / ink2 AA (tokens.test.ts);
 * the real frames measure far higher (docs/qa/02-glass). Chips (chapter bar, pills, toasts) are a little
 * denser because their short labels sit directly on them: ink passes AA over black. `body`, `eyebrow`
 * and `lilac700` text must not sit on bare glass.
 */
export const liquidGlass = {
  /** Panel tint, top → bottom. */
  panelTop: "rgba(255,255,255,.34)",
  panelBottom: "rgba(255,255,255,.22)",
  /** Chips: chapter bar, zoom pill, center pill, toasts. */
  chipTop: "rgba(255,255,255,.60)",
  chipBottom: "rgba(255,255,255,.50)",
  /** Local legibility veil behind text blocks (paper), feathered at its edges. */
  veil: "rgba(253,250,247,.58)",
  veilClear: "rgba(253,250,247,0)",
  /** Wells inside the glass (Zalo pings, gains, service rows). */
  well: "rgba(253,250,247,.76)",
  /** Specular rim (1 px inner highlight) and the gradient refraction border. */
  rim: "rgba(255,255,255,.92)",
  rimSoft: "rgba(255,255,255,.30)",
  rimClear: "rgba(255,255,255,0)",
  /** Outer soft edge that separates the glass from light backdrops. */
  edge: "rgba(34,16,36,.10)",
  /** Faint inner shade at the bottom (thickness). */
  shade: "rgba(34,16,36,.07)",
  /** Inner sheen from the top-left. */
  sheen: "rgba(255,255,255,.38)",
  /** Soft halo around text on glass (legibility at glyph edges only). */
  halo: "rgba(255,255,255,.55)",
  /**
   * Near-solid fallbacks: no backdrop-filter support, `prefers-reduced-transparency: reduce` or
   * `prefers-contrast: more`.
   */
  solidPanel: "rgba(253,250,247,.92)",
  solidChip: "rgba(255,255,255,.94)",
  blur: 30,
  blurChip: 22,
  saturate: 1.7,
  brightness: 1.06,
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

/** Opacity tokens. */
export const opacity = { backdrop: 0.42, disabled: 0.4 } as const;

/** Elevation presets (RN shadow props; react-native-web maps them to box-shadow). Web CSS uses `shadow`. */
export const elevation = {
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
