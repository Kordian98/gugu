/** Keep API-supported split shifts intact until the operator explicitly replaces them. */
type Interval = { start: string; end: string };
type ScheduleDay = { weekday: number; intervals: Interval[]; breaks?: Interval[] };
export type ScheduleDraftDay = {
  weekday: number;
  on: boolean;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
  preserved: { intervals: Interval[]; breaks: Interval[] } | null;
};

export function scheduleDraftDay(weekday: number, day?: ScheduleDay): ScheduleDraftDay {
  const intervals = day?.intervals ?? [];
  const breaks = day?.breaks ?? [];
  return {
    weekday,
    on: intervals.length > 0,
    start: intervals[0]?.start ?? "09:00",
    end: intervals.at(-1)?.end ?? "18:00",
    breakStart: breaks[0]?.start ?? "",
    breakEnd: breaks[0]?.end ?? "",
    preserved: intervals.length > 1 || breaks.length > 1 ? { intervals, breaks } : null,
  };
}

export function scheduleDayInput(day: ScheduleDraftDay) {
  return {
    weekday: day.weekday,
    intervals: day.on ? (day.preserved?.intervals ?? [{ start: day.start, end: day.end }]) : [],
    breaks: day.on
      ? (day.preserved?.breaks ??
        (day.breakStart && day.breakEnd ? [{ start: day.breakStart, end: day.breakEnd }] : []))
      : [],
  };
}

/** Numeric wall-clock notation; these values already come from the salon schedule. */
export const intervalSummary = (intervals: Interval[]) =>
  intervals.map((x) => `${x.start}–${x.end}`).join(" · ");
