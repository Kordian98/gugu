import { DEFAULT_SALON_TIMEZONE } from "@gugu/localization";

/**
 * Salon wall-clock helpers. Instants are UTC ISO strings from the API; the calendar works in the
 * salon's IANA timezone (VN has no DST, but nothing here assumes a fixed offset).
 */

/** "YYYY-MM-DD" of an instant in the salon timezone. */
export const salonDate = (d: Date, tz = DEFAULT_SALON_TIMEZONE): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

/** Minutes since local midnight of an instant in the salon timezone. */
export function minutesInZone(d: Date, tz = DEFAULT_SALON_TIMEZONE): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  })
    .format(d)
    .split(":")
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** UTC offset of `tz` at instant `d`, in minutes (e.g. +420 for Asia/Ho_Chi_Minh). */
export function offsetMinutes(tz: string, d: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part ?? "");
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Instant for a salon-local date + minutes since midnight, as an ISO string with offset. */
export function instantAt(ymd: string, minutes: number, tz = DEFAULT_SALON_TIMEZONE): string {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const off = offsetMinutes(tz, new Date(guess.getTime() + minutes * 60_000));
  return new Date(guess.getTime() + (minutes - off) * 60_000).toISOString();
}

/** "YYYY-MM-DD" ± n days. */
export const addDays = (ymd: string, n: number): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** ISO weekday (1 = Monday) of a local date. */
export const isoWeekday = (ymd: string): number => new Date(`${ymd}T12:00:00Z`).getUTCDay() || 7;

/** "HH:MM" → minutes. */
export const clockMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
