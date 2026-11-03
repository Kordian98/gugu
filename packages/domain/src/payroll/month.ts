import { addDays, type LocalDate } from "../booking/tz";

/** A calendar month in the salon's timezone, `YYYY-MM`. */
export type Month = string;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isMonth = (value: string): value is Month => MONTH_RE.test(value);

export function monthOf(date: LocalDate): Month {
  return date.slice(0, 7);
}

export function daysInMonth(month: Month): number {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First and last local date of the month (inclusive). */
export function monthRange(month: Month): { from: LocalDate; to: LocalDate } {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

export function addMonths(month: Month, n: number): Month {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy)}-${String(mm + 1).padStart(2, "0")}`;
}

/**
 * How far `today` is through `month`: days elapsed including today, clamped to the month.
 * Past months are complete; future months have 0 days elapsed.
 */
export function monthProgress(
  month: Month,
  today: LocalDate,
): { elapsedDays: number; daysInMonth: number; phase: "past" | "current" | "future" } {
  const dim = daysInMonth(month);
  const current = monthOf(today);
  if (current > month) return { elapsedDays: dim, daysInMonth: dim, phase: "past" };
  if (current < month) return { elapsedDays: 0, daysInMonth: dim, phase: "future" };
  return { elapsedDays: Number(today.slice(8, 10)), daysInMonth: dim, phase: "current" };
}

/** Every local date of the month. */
export function monthDates(month: Month): LocalDate[] {
  const { from } = monthRange(month);
  return Array.from({ length: daysInMonth(month) }, (_, i) => addDays(from, i));
}
