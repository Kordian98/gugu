import { estimate, type Estimate } from "../pricing/model";
import type { ScreenName } from "../screens";

/**
 * Case studies (owner, 2026-11-04/05): four ILLUSTRATIVE salons (invented names, hypothetical
 * figures). Every number comes from the pricing model's `estimate()` with the salon's own inputs, so
 * the stories and the buying assistant always agree. Every feature named is in Basic.
 */
export type CaseKey = "nail" | "hair" | "spa" | "lash";
/** What an outcome measures: front-desk hours, owner hours, revenue kept (from `estimate()`). */
export type Metric = "desk" | "owner" | "kept";
/** Map node glyphs (cases/Glyph.tsx). */
export type GlyphName =
  | "chat"
  | "book"
  | "phone"
  | "clash"
  | "bot"
  | "slot"
  | "cal"
  | "bell"
  | "bellOff"
  | "sheet"
  | "calc"
  | "ask"
  | "check"
  | "coins"
  | "wallet"
  | "bed"
  | "board"
  | "chart"
  | "moon"
  | "away"
  | "walkIn"
  | "insta"
  | "list";

/** A note of the old way: glyph and position (% of the map), tilt in degrees. */
export type BeforeNode = { g: GlyphName; x: number; y: number; r: number };
/** A wire between two notes (indices); `bad` = where it goes wrong (double booking, mistakes, no-shows). */
export type Wire = { from: number; to: number; bend: number; bad?: boolean };

/**
 * One layer of the screenshot stack: a real CRM crop ([3×, 2×] files), optionally only a region of it
 * ([x0, y0, x1, y1] as fractions), or the illustrated Zalo OA card. `w` / `x` / `y`: width and offset
 * in % of the stack width (y too, so the composition keeps its shape at any width).
 */
export type Layer =
  | {
      kind: "shot";
      src: readonly [ScreenName, ScreenName];
      region?: readonly [number, number, number, number];
      w: number;
      x: number;
      y: number;
    }
  | { kind: "zalo"; w: number; x: number; y: number };

export type Case = {
  k: CaseKey;
  /** Inputs of the pricing model: bookings per week, average price (VND), staff for payroll. */
  weekly: number;
  price: number;
  staff: number;
  /** This salon's own old way (labels `b1…`), and the GuGu Studio flow that resolves it (`a1…a4`). */
  before: readonly BeforeNode[];
  wires: readonly Wire[];
  after: readonly [GlyphName, GlyphName, GlyphName, GlyphName];
  /** The three outcomes in the order told. */
  outcomes: readonly [Metric, Metric, Metric];
  /** Screens of exactly the features behind the outcomes: desktop (2–3 layers), phones (2). */
  stack: readonly Layer[];
  mstack: readonly [Layer, Layer];
};

export const CASES: readonly Case[] = [
  {
    // walk-ins + Zalo DMs + a paper notebook → double bookings
    k: "nail",
    weekly: 60,
    price: 250_000,
    staff: 3,
    before: [
      { g: "walkIn", x: 19, y: 20, r: -4 },
      { g: "chat", x: 80, y: 18, r: 3 },
      { g: "book", x: 50, y: 50, r: -2 },
      { g: "clash", x: 21, y: 82, r: 3 },
      { g: "phone", x: 79, y: 82, r: -3 },
    ],
    wires: [
      { from: 0, to: 2, bend: 18 },
      { from: 1, to: 2, bend: -18 },
      { from: 2, to: 3, bend: 14, bad: true },
      { from: 1, to: 4, bend: 26 },
      { from: 4, to: 2, bend: -14 },
    ],
    after: ["bot", "walkIn", "cal", "bell"],
    outcomes: ["desk", "kept", "owner"],
    stack: [
      {
        kind: "shot",
        src: ["calendarCrop", "calendarCrop2x"],
        region: [0, 0, 0.72, 1],
        w: 82,
        x: 0,
        y: 0,
      },
      { kind: "shot", src: ["upcoming", "upcoming"], w: 42, x: 58, y: 30 },
      { kind: "zalo", w: 52, x: 3, y: 40 },
    ],
    mstack: [
      { kind: "shot", src: ["mCalendar", "mCalendar2x"], w: 86, x: 0, y: 0 },
      { kind: "zalo", w: 82, x: 18, y: 84 },
    ],
  },
  {
    // a stylist's personal Zalo + a wall calendar + commission maths in Excel
    k: "hair",
    weekly: 90,
    price: 300_000,
    staff: 5,
    before: [
      { g: "chat", x: 20, y: 20, r: -3 },
      { g: "cal", x: 79, y: 20, r: 4 },
      { g: "sheet", x: 50, y: 52, r: -2 },
      { g: "calc", x: 19, y: 83, r: 3 },
      { g: "ask", x: 79, y: 83, r: -3 },
    ],
    wires: [
      { from: 0, to: 1, bend: -16 },
      { from: 1, to: 2, bend: 16 },
      { from: 3, to: 2, bend: -14 },
      { from: 2, to: 4, bend: 14, bad: true },
      { from: 0, to: 4, bend: 30 },
    ],
    after: ["slot", "check", "coins", "wallet"],
    outcomes: ["owner", "desk", "kept"],
    stack: [
      {
        kind: "shot",
        src: ["calendarCrop", "calendarCrop2x"],
        region: [0, 0, 0.72, 1],
        w: 76,
        x: 0,
        y: 0,
      },
      {
        kind: "shot",
        src: ["payrollMonth", "payrollMonth2x"],
        region: [0, 0.1, 0.52, 0.9],
        w: 54,
        x: 46,
        y: 18,
      },
      {
        kind: "shot",
        src: ["payrollPerson", "payrollPerson2x"],
        region: [0, 0, 1, 0.54],
        w: 46,
        x: 2,
        y: 40,
      },
    ],
    mstack: [
      { kind: "shot", src: ["mCalendar", "mCalendar2x"], w: 80, x: 0, y: 0 },
      {
        kind: "shot",
        src: ["mPayroll", "mPayroll2x"],
        region: [0, 0.46, 1, 1],
        w: 80,
        x: 20,
        y: 78,
      },
    ],
  },
  {
    // phone calls + a room board on paper + the owner tallying revenue at night
    k: "spa",
    weekly: 50,
    price: 450_000,
    staff: 4,
    before: [
      { g: "phone", x: 19, y: 20, r: -3 },
      { g: "board", x: 79, y: 20, r: 3 },
      { g: "bed", x: 50, y: 51, r: -2 },
      { g: "book", x: 19, y: 83, r: 3 },
      { g: "moon", x: 79, y: 83, r: -3 },
    ],
    wires: [
      { from: 0, to: 1, bend: -16 },
      { from: 1, to: 2, bend: 14, bad: true },
      { from: 0, to: 3, bend: -18 },
      { from: 3, to: 4, bend: 16 },
      { from: 2, to: 4, bend: -14 },
    ],
    after: ["bot", "bed", "check", "chart"],
    outcomes: ["kept", "owner", "desk"],
    stack: [
      { kind: "shot", src: ["mResources", "mResources2x"], w: 58, x: 0, y: 0 },
      { kind: "shot", src: ["mMonth", "mMonth2x"], w: 60, x: 40, y: 32 },
    ],
    mstack: [
      { kind: "shot", src: ["mResources", "mResources2x"], w: 84, x: 0, y: 0 },
      { kind: "shot", src: ["mMonth", "mMonth2x"], w: 84, x: 16, y: 84 },
    ],
  },
  {
    // Instagram / Zalo messages + a notebook → forgotten reminders → no-shows
    k: "lash",
    weekly: 35,
    price: 300_000,
    staff: 2,
    before: [
      { g: "insta", x: 20, y: 18, r: -4 },
      { g: "chat", x: 79, y: 18, r: 3 },
      { g: "book", x: 50, y: 49, r: -2 },
      { g: "bellOff", x: 21, y: 82, r: 2 },
      { g: "away", x: 79, y: 82, r: -3 },
    ],
    wires: [
      { from: 0, to: 2, bend: -20 },
      { from: 1, to: 2, bend: 12 },
      { from: 2, to: 3, bend: 16 },
      { from: 3, to: 4, bend: -12, bad: true },
    ],
    after: ["bot", "list", "bell", "check"],
    outcomes: ["desk", "kept", "owner"],
    stack: [
      { kind: "zalo", w: 52, x: 0, y: 12 },
      { kind: "shot", src: ["mAppointments", "mAppointments2x"], w: 52, x: 48, y: 0 },
    ],
    mstack: [
      { kind: "zalo", w: 86, x: 0, y: 0 },
      { kind: "shot", src: ["mAppointments", "mAppointments2x"], w: 82, x: 18, y: 50 },
    ],
  },
];

/** The pricing model's estimate for a case (Basic: no assistant, one location). */
export const caseEstimate = (c: Case): Estimate =>
  estimate({ weekly: c.weekly, price: c.price, staff: c.staff });

/** The value an outcome shows: hours (desk / owner) or đồng kept per month. */
export function metricValue(e: Estimate, m: Metric): number {
  if (m === "desk") return e.hours;
  if (m === "owner") return e.ownerHours;
  return e.keptVnd;
}
