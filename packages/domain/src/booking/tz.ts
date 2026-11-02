/**
 * Wall-clock ↔ instant conversion for an IANA time zone, using only `Intl` (no dependency; works in
 * Node and Hermes). Salon schedules are local wall-clock times; everything stored is UTC
 * (spec 06 G16). Vietnam has no DST, but the engine is DST-safe for later markets:
 * - a local time inside a spring-forward gap does not exist (`instantsAt` returns `[]`);
 * - a local time inside a fall-back overlap exists twice (`instantsAt` returns both, earliest first).
 */

/** Calendar date `YYYY-MM-DD` in the salon's zone. */
export type LocalDate = string;

const MINUTE = 60_000;
const DAY_MINUTES = 1440;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Throws for an unknown zone id (validate salon input with this). */
export function assertTimeZone(timeZone: string): void {
  formatter(timeZone);
}

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallAt(ms: number, timeZone: string): Wall {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts["year"] ?? 0,
    month: parts["month"] ?? 0,
    day: parts["day"] ?? 0,
    hour: parts["hour"] ?? 0,
    minute: parts["minute"] ?? 0,
    second: parts["second"] ?? 0,
  };
}

/** UTC offset of the zone at an instant, in minutes (Asia/Ho_Chi_Minh → 420). */
export function offsetMinutesAt(ms: number, timeZone: string): number {
  const w = wallAt(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function parseDate(date: LocalDate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`invalid local date "${date}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The local calendar date and minute-of-day of an instant. */
export function toLocal(ms: number, timeZone: string): { date: LocalDate; minute: number } {
  const w = wallAt(ms, timeZone);
  return {
    date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`,
    minute: w.hour * 60 + w.minute,
  };
}

/**
 * All instants at which the zone's clock shows `date` + `minute` (0–1439): one normally, none in a
 * DST gap, two in a DST overlap (earliest first). Minute 1440 means the next day's midnight.
 */
export function instantsAt(date: LocalDate, minute: number, timeZone: string): number[] {
  if (minute === DAY_MINUTES) return instantsAt(addDays(date, 1), 0, timeZone);
  const key = `${timeZone}|${date}|${String(minute)}`;
  const cached = instantCache.get(key);
  if (cached) return cached;
  const result = computeInstants(date, minute, timeZone);
  if (instantCache.size >= INSTANT_CACHE_MAX) instantCache.clear();
  instantCache.set(key, result);
  return result;
}

// Pure function of (zone, date, minute) for a given tzdata version, so memoising is safe; the
// slot grid asks for the same values over and over and Intl formatting is the hot path.
const INSTANT_CACHE_MAX = 100_000;
const instantCache = new Map<string, number[]>();

function computeInstants(date: LocalDate, minute: number, timeZone: string): number[] {
  const [y, mo, d] = parseDate(date);
  const naive = Date.UTC(y, mo - 1, d) + minute * MINUTE;
  const offsets = new Set([
    offsetMinutesAt(naive - DAY_MINUTES * MINUTE, timeZone),
    offsetMinutesAt(naive, timeZone),
    offsetMinutesAt(naive + DAY_MINUTES * MINUTE, timeZone),
  ]);
  const found = new Set<number>();
  for (const offset of offsets) {
    const candidate = naive - offset * MINUTE;
    const local = toLocal(candidate, timeZone);
    if (local.date === date && local.minute === minute) found.add(candidate);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * One instant for a wall-clock boundary (opening hours, schedules). Inside a gap it resolves to
 * the instant the clock jumps to; inside an overlap, `edge` picks the earlier (`start`) or the
 * later (`end`) occurrence so intervals never shrink.
 */
export function boundaryInstant(
  date: LocalDate,
  minute: number,
  timeZone: string,
  edge: "start" | "end",
): number {
  const all = instantsAt(date, minute, timeZone);
  if (all.length > 0) return (edge === "start" ? all[0] : all.at(-1)) as number;
  // Gap: the first existing minute after it is the jump target.
  for (let m = minute + 1; m <= DAY_MINUTES; m++) {
    const next = instantsAt(date, m, timeZone);
    if (next.length > 0) return next[0] as number;
  }
  /* c8 ignore next */
  throw new Error(`no instant for ${date} ${String(minute)} in ${timeZone}`);
}

/** `date` shifted by whole calendar days. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** ISO weekday of a calendar date: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: LocalDate): number {
  const [y, m, d] = parseDate(date);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Inclusive list of dates from `from` to `to` (empty when `to` < `from`). */
export function datesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The local day as an instant interval `[00:00, next 00:00)`. */
export function dayBounds(date: LocalDate, timeZone: string): { start: number; end: number } {
  return {
    start: boundaryInstant(date, 0, timeZone, "start"),
    end: boundaryInstant(addDays(date, 1), 0, timeZone, "start"),
  };
}
