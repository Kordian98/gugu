import { FREE_BASIC_MONTHS } from "@gugu/contracts";
import { dayBounds, type LocalDate, toLocal } from "@gugu/domain";

/**
 * X25: end (exclusive) of a salon's free Basic year. The salon registered on local date D (in its
 * own time zone); Basic is free through D + 12 months (that whole local day), so the free year ends
 * at the local midnight after it. A day that does not exist in the target month is clamped
 * (29 Feb → 28 Feb), matching Postgres `date + interval '12 months'` used by the backfill.
 */
export function freeYearEnd(registeredAt: Date, timeZone: string): Date {
  const { date } = toLocal(registeredAt.getTime(), timeZone);
  return new Date(dayBounds(addMonthsClamped(date, FREE_BASIC_MONTHS), timeZone).end);
}

/** True while the free Basic year is running. */
export function isInFreeYear(freeUntil: Date | null, now: Date): boolean {
  return freeUntil !== null && freeUntil > now;
}

function addMonthsClamped(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}
