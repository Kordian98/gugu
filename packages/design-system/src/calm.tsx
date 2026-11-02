import { createContext, useContext, type ReactNode } from "react";

import { color } from "./tokens";

/** `#RRGGBB` + opacity → `rgba()`. Calm tints are derived from Lilac Glow tokens, never ad-hoc hex. */
export function alpha(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${String(r)},${String(g)},${String(b)},${String(opacity)})`;
}

/** Dark theme canvas for calm surfaces (02 §3.2, X18). */
const night = "#1A0E18";

type EventTone = { bg: string; border: string; text: string };

export type CalmPalette = {
  canvas: string;
  surface: string;
  surfaceMuted: string;
  line: string;
  ink: string;
  body: string;
  muted: string;
  accent: string;
  accentBg: string;
  onAccent: string;
  accentSoft: string;
  focus: string;
  sidebar: string;
  sidebarText: string;
  sidebarMuted: string;
  sidebarLine: string;
  sidebarHover: string;
  navActiveBg: string;
  navActiveText: string;
  badgeBg: string;
  badgeText: string;
  up: { bg: string; text: string };
  down: { bg: string; text: string };
  attention: string;
  event: {
    confirmed: EventTone;
    inProgress: EventTone;
    pending: EventTone;
    completed: EventTone;
    break: { bg: string; hatch: string; text: string };
  };
  shadow: string;
};

/**
 * Calm surface mode (CRM, admin): same Lilac Glow tokens as marketing, volume turned down (07 §3.11).
 * Light follows ref crm-01 layout; dark is the X18 variant. Text/background pairs are WCAG AA.
 */
export const calmColor: Record<"light" | "dark", CalmPalette> = {
  light: {
    canvas: color.canvas,
    surface: color.white,
    surfaceMuted: color.tile,
    line: color.line,
    ink: color.ink,
    body: color.body,
    muted: color.muted,
    accent: color.lilac700,
    accentBg: color.lilac500,
    onAccent: color.plum950,
    accentSoft: color.lilac100,
    focus: color.lilac500,
    sidebar: color.plum950,
    sidebarText: alpha(color.canvas, 0.86),
    sidebarMuted: alpha(color.canvas, 0.55),
    sidebarLine: alpha(color.canvas, 0.1),
    sidebarHover: alpha(color.canvas, 0.07),
    navActiveBg: color.lilac500,
    navActiveText: color.plum950,
    badgeBg: color.pink300,
    badgeText: color.plum950,
    up: { bg: color.lilac100, text: color.lilac700 },
    down: { bg: alpha(color.pink300, 0.45), text: color.ink2 },
    attention: color.rose500,
    event: {
      confirmed: { bg: alpha(color.lilac300, 0.75), border: color.lilac500, text: color.ink },
      inProgress: { bg: alpha(color.pink300, 0.6), border: color.rose500, text: color.ink },
      pending: { bg: alpha(color.peach400, 0.42), border: color.peach400, text: color.ink },
      completed: { bg: color.tile, border: color.line, text: color.body },
      break: { bg: color.tile, hatch: color.line, text: color.body },
    },
    shadow: color.ink,
  },
  dark: {
    canvas: night,
    surface: color.plum950,
    surfaceMuted: alpha(color.canvas, 0.06),
    line: alpha(color.canvas, 0.12),
    ink: color.canvas,
    body: alpha(color.canvas, 0.78),
    muted: alpha(color.canvas, 0.6),
    accent: color.lilac300,
    accentBg: color.lilac500,
    onAccent: color.plum950,
    accentSoft: alpha(color.lilac500, 0.2),
    focus: color.lilac300,
    sidebar: night,
    sidebarText: alpha(color.canvas, 0.86),
    sidebarMuted: alpha(color.canvas, 0.55),
    sidebarLine: alpha(color.canvas, 0.1),
    sidebarHover: alpha(color.canvas, 0.07),
    navActiveBg: color.lilac500,
    navActiveText: color.plum950,
    badgeBg: color.pink300,
    badgeText: color.plum950,
    up: { bg: alpha(color.lilac500, 0.22), text: color.lilac300 },
    down: { bg: alpha(color.pink300, 0.2), text: color.pink300 },
    attention: color.pink300,
    event: {
      confirmed: { bg: alpha(color.lilac500, 0.32), border: color.lilac300, text: color.canvas },
      inProgress: { bg: alpha(color.rose500, 0.3), border: color.pink300, text: color.canvas },
      pending: { bg: alpha(color.peach400, 0.26), border: color.peach400, text: color.canvas },
      completed: {
        bg: alpha(color.canvas, 0.06),
        border: alpha(color.canvas, 0.14),
        text: alpha(color.canvas, 0.78),
      },
      break: {
        bg: alpha(color.canvas, 0.04),
        hatch: alpha(color.canvas, 0.12),
        text: alpha(color.canvas, 0.78),
      },
    },
    shadow: night,
  },
};

export type CalmScheme = keyof typeof calmColor;

const CalmContext = createContext<{ scheme: CalmScheme; c: CalmPalette }>({
  scheme: "light",
  c: calmColor.light,
});

/** Provides the calm palette for a scheme. The app decides the scheme (system + user override). */
export function CalmThemeProvider({
  scheme,
  children,
}: {
  scheme: CalmScheme;
  children: ReactNode;
}) {
  return (
    <CalmContext.Provider value={{ scheme, c: calmColor[scheme] }}>{children}</CalmContext.Provider>
  );
}

export function useCalm(): { scheme: CalmScheme; c: CalmPalette } {
  return useContext(CalmContext);
}
