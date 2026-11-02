import type { StaffBreakRule, StaffScheduleRule } from "../booking/availability";
import { type Interval, normalize, overlapLength, subtract } from "../booking/intervals";
import { datesBetween, instantsAt, isoWeekday, type LocalDate } from "../booking/tz";

/**
 * Scheduled working minutes and booked minutes for utilisation (topic 08 metric
 * `utilization_rate` = booked ÷ scheduled). Booked time counts only inside scheduled time, so a
 * booking outside the schedule cannot push utilisation above 100 %.
 */
export interface StaffWorkInput {
  schedules: readonly StaffScheduleRule[];
  breaks: readonly StaffBreakRule[];
  timeOff: readonly Interval[];
  /** Active bookings (not cancelled / no-show) as instant intervals. */
  booked: readonly Interval[];
}

export interface UtilizationResult {
  scheduledMinutes: number;
  bookedMinutes: number;
  /** Percent with one decimal; null when nothing was scheduled. */
  utilizationPercent: number | null;
}

const MINUTE = 60_000;

/** Working intervals (instants) of one staff member between two local dates, inclusive. */
export function workIntervals(
  input: Pick<StaffWorkInput, "schedules" | "breaks" | "timeOff">,
  from: LocalDate,
  to: LocalDate,
  timeZone: string,
): Interval[] {
  const out: Interval[] = [];
  for (const date of datesBetween(from, to)) {
    const weekday = isoWeekday(date);
    const day = input.schedules.filter(
      (s) =>
        s.weekday === weekday &&
        s.effectiveFrom <= date &&
        (s.effectiveTo === null || s.effectiveTo >= date),
    );
    const breaks = input.breaks.filter(
      (b) => b.date === date || (b.date === null && b.weekday === weekday),
    );
    const work = normalize(
      day.map((s) => toInstants(date, s.startMinute, s.endMinute, timeZone)).filter(nonEmpty),
    );
    const off = breaks
      .map((b) => toInstants(date, b.startMinute, b.endMinute, timeZone))
      .filter(nonEmpty);
    out.push(...subtract(work, off));
  }
  return subtract(normalize(out), normalize([...input.timeOff]));
}

export function utilization(
  input: StaffWorkInput,
  from: LocalDate,
  to: LocalDate,
  timeZone: string,
): UtilizationResult {
  const work = workIntervals(input, from, to, timeZone);
  const scheduled = work.reduce((n, w) => n + (w.end - w.start), 0);
  const booked = normalize([...input.booked]).reduce((n, b) => n + overlapLength(work, b), 0);
  const scheduledMinutes = Math.round(scheduled / MINUTE);
  const bookedMinutes = Math.round(booked / MINUTE);
  return {
    scheduledMinutes,
    bookedMinutes,
    utilizationPercent:
      scheduledMinutes > 0 ? Math.round((bookedMinutes / scheduledMinutes) * 1000) / 10 : null,
  };
}

function toInstants(date: LocalDate, startMinute: number, endMinute: number, tz: string): Interval {
  const start = instantsAt(date, startMinute, tz)[0];
  const end = instantsAt(date, endMinute, tz).at(-1);
  return { start: start ?? 0, end: end ?? 0 };
}

const nonEmpty = (i: Interval) => i.end > i.start;
