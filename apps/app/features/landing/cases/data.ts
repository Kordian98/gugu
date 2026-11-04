import { estimate, type Estimate } from "../pricing/model";
import type { ScreenName } from "../screens";

/**
 * Case studies (owner, 2026-11-04): four ILLUSTRATIVE salons (fictional names, hypothetical figures).
 * Every number comes from the pricing model's `estimate()` with the salon's own inputs, so the stories
 * and the buying assistant always agree. Every feature named is in Basic (free for the first year).
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
  | "sheet"
  | "calc"
  | "ask"
  | "check"
  | "coins"
  | "wallet"
  | "export"
  | "bed"
  | "sum"
  | "chart"
  | "moon"
  | "clock"
  | "away"
  | "note"
  | "list"
  | "person";

export type Case = {
  k: CaseKey;
  /** Inputs of the pricing model: bookings per week, average price (VND), staff for payroll. */
  weekly: number;
  price: number;
  staff: number;
  /** Old way (tangle) and GuGu Studio flow (left → right), one glyph per node; labels are i18n. */
  before: readonly [GlyphName, GlyphName, GlyphName, GlyphName];
  after: readonly [GlyphName, GlyphName, GlyphName, GlyphName];
  /** The three outcomes in the order told. */
  outcomes: readonly [Metric, Metric, Metric];
  /** Real CRM crop of the demo salon: desktop [3×, 2×] and phone [3×, 2×] (scripts/landing-screens.mjs). */
  shot: readonly [ScreenName, ScreenName];
  mshot: readonly [ScreenName, ScreenName];
  /** Desktop: show the crop at `zoom` × the column width (top-left), the box at most `box` × as high. */
  zoom: number;
  box: number;
};

export const CASES: readonly Case[] = [
  {
    k: "nail",
    weekly: 60,
    price: 250_000,
    staff: 3,
    before: ["chat", "book", "phone", "clash"],
    after: ["bot", "slot", "cal", "bell"],
    outcomes: ["desk", "kept", "owner"],
    shot: ["calendarCrop", "calendarCrop2x"],
    mshot: ["mCalendar", "mCalendar2x"],
    zoom: 1,
    box: 0.7,
  },
  {
    k: "hair",
    weekly: 90,
    price: 300_000,
    staff: 5,
    before: ["sheet", "calc", "ask", "book"],
    after: ["check", "coins", "wallet", "export"],
    outcomes: ["owner", "desk", "kept"],
    shot: ["payrollMonth", "payrollMonth2x"],
    mshot: ["mPayroll", "mPayroll2x"],
    zoom: 1.6,
    box: 0.68,
  },
  {
    k: "spa",
    weekly: 50,
    price: 450_000,
    staff: 4,
    before: ["phone", "book", "bed", "sum"],
    after: ["bot", "bed", "check", "chart"],
    outcomes: ["kept", "owner", "desk"],
    shot: ["overview", "overview2x"],
    mshot: ["mMonth", "mMonth2x"],
    zoom: 1.25,
    box: 0.56,
  },
  {
    k: "lash",
    weekly: 35,
    price: 300_000,
    staff: 2,
    before: ["moon", "clock", "away", "note"],
    after: ["bot", "slot", "list", "person"],
    outcomes: ["desk", "kept", "owner"],
    shot: ["appointmentsCrop", "appointmentsCrop2x"],
    mshot: ["mAppointments", "mAppointments2x"],
    zoom: 1.45,
    box: 0.6,
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
