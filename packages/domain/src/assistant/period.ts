import type { PeriodExpression } from "@gugu/contracts";
import { addDays, isoWeekday, type LocalDate, toLocal } from "../booking/tz";

/** Inclusive salon-local date range. */
export interface LocalPeriod {
  from: LocalDate;
  to: LocalDate;
}

/**
 * Resolves "hôm nay", "tuần trước", "tháng này"… (as an enum the model picks) to dates in the
 * salon's timezone. Weeks start on Monday (ISO). Deterministic, so the model never does date math.
 */
export function resolvePeriod(
  expression: PeriodExpression,
  nowMs: number,
  timeZone: string,
): LocalPeriod {
  const today = toLocal(nowMs, timeZone).date;
  const monday = addDays(today, 1 - isoWeekday(today));
  const monthStart = `${today.slice(0, 8)}01`;
  switch (expression) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "tomorrow":
      return { from: addDays(today, 1), to: addDays(today, 1) };
    case "this_week":
      return { from: monday, to: addDays(monday, 6) };
    case "last_week":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "next_week":
      return { from: addDays(monday, 7), to: addDays(monday, 13) };
    case "this_month":
      return { from: monthStart, to: addDays(nextMonthStart(monthStart), -1) };
    case "last_month": {
      const lastMonthEnd = addDays(monthStart, -1);
      return { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd };
    }
    case "last_7_days":
      return { from: addDays(today, -6), to: today };
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
  }
}

function nextMonthStart(monthStart: LocalDate): LocalDate {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  return m === 12 ? `${String(y + 1)}-01-01` : `${String(y)}-${String(m + 1).padStart(2, "0")}-01`;
}
