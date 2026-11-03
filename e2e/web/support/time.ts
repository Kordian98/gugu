// Salon-local dates. Seed salons are in Asia/Ho_Chi_Minh (UTC+7, no DST), so wall-clock times map
// to fixed instants: `vnInstant("2026-11-04", "10:00")` → "2026-11-04T03:00:00.000Z".
export const TZ = "Asia/Ho_Chi_Minh";

export const vnDate = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

export const addDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const vnInstant = (date: string, hhmm: string): string =>
  new Date(`${date}T${hhmm}:00+07:00`).toISOString();

/** ISO weekday (1 = Monday … 7 = Sunday) of a salon-local date. */
export const isoWeekday = (date: string): number => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Current salon-local "HH:MM". */
export const vnNow = (): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
