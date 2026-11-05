import type { Insights } from "@gugu/contracts";

import { addDays } from "../../data/dates";

/** The API omits dates without bookings. Keep those days on the time axis at zero. */
export function dailyChartData(data: Insights["daily"], from: string, to: string) {
  const byDate = new Map(data.map((day) => [day.date, day.appointments]));
  const days: { date: string; appointments: number }[] = [];
  for (let date = from; date <= to && days.length < 93; date = addDays(date, 1)) {
    days.push({ date, appointments: byDate.get(date) ?? 0 });
  }
  return days;
}

/** Whole-count ticks, zero baseline and room above the largest bar. */
export function dailyChartTicks(max: number): number[] {
  const roughStep = Math.max(1, max / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= roughStep) ?? 1;
  const top = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: top + 1 }, (_, i) => i * step);
}
