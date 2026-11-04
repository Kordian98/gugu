import type { GlyphName } from "./data";

/** 24 × 24 stroke glyphs for the before → after map (decorative; the label is the text next to it). */
const PATHS: Record<GlyphName, string> = {
  chat: "M4 5h16v11H9l-5 4z",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11",
  phone:
    "M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z",
  clash: "M12 3 22 20H2z M12 10v4 M12 17h.01",
  bot: "M4 5h16v11H9l-5 4z M12 7.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z",
  slot: "M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5 M9 15l2 2 4-4",
  cal: "M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5 M8 14h3 M13 14h3 M8 17h3",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4",
  sheet: "M4 4h16v16H4z M4 9h16 M4 14h16 M10 4v16",
  calc: "M6 3h12v18H6z M9 7h6 M9 12h.01 M12 12h.01 M15 12h.01 M9 16h.01 M12 16h.01 M15 16h.01",
  ask: "M4 5h16v11H9l-5 4z M10 8.5a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.3 M12 13.5h.01",
  check: "M4 12l5 5L20 6",
  coins: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 15l6-6 M9.5 9.5h.01 M14.5 14.5h.01",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3z M3 7l12-3v3 M16 13h2",
  bed: "M3 18V7 M3 14h18v4 M21 14v-2a3 3 0 0 0-3-3h-7v5 M6.5 11.5h.01",
  chart: "M4 20V4 M4 20h16 M8 16v-4 M12 16V9 M16 16V7",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z",
  away: "M12 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0z M3 20a6 6 0 0 1 12 0 M16 12h6 M19 9l3 3-3 3",
  list: "M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01",
  bellOff: "M6 16v-5a6 6 0 0 1 9.5-4.9 M18 11v5l2 2H8 M10 21h4 M3 3l18 18",
  board: "M4 4h16v13H4z M8 21l2-4 M16 21l-2-4 M7 8h4 M7 12h3 M14 8h3 M14 12h3",
  walkIn: "M10 4a2 2 0 1 0 0 .01 M9 21l2-7 3 3v5 M7 12l3-4 4 2 3 3 M5 21l3-6",
  insta:
    "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17 7h.01",
};

export function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg className="cx-g" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
