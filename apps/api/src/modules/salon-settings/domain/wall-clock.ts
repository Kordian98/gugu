/**
 * Wall-clock helpers for Postgres `time(0)` / `date` columns. Prisma maps both to a JS Date on
 * 1970-01-01 (time) or at UTC midnight (date); these keep the conversion in one place.
 */

/** "09:30" → Date(1970-01-01T09:30:00Z) for a `time(0)` column. */
export const toTimeColumn = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00.000Z`);

/** `time(0)` column → "09:30". */
export const fromTimeColumn = (d: Date): string => d.toISOString().slice(11, 16);

/** "2026-11-02" → Date(2026-11-02T00:00:00Z) for a `date` column. */
export const toDateColumn = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

/** `date` column → "2026-11-02". */
export const fromDateColumn = (d: Date): string => d.toISOString().slice(0, 10);

/** Today's local date ("YYYY-MM-DD") in an IANA timezone. */
export const localDate = (now: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
