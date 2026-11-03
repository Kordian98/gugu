import { intersect, type Interval, normalize, overlapLength, subtract } from "./intervals";
import {
  type ChainClaims,
  chainLines,
  type LinePlan,
  MAX_SERVICE_LINES,
  planLines,
  type ServiceLine,
  toOption,
} from "./chain";
import type { ResourceInput } from "./resources";
import {
  addDays,
  boundaryInstant,
  datesBetween,
  dayBounds,
  daysBetween,
  instantsAt,
  isLocalDate,
  isoWeekday,
  type LocalDate,
  toLocal,
} from "./tz";

/**
 * Slot computation — the pure core of the booking engine (spec 06 §3.3). No I/O: the API loads
 * hours, schedules, time off and occupancy in a few batched queries and calls `computeSlots`; the
 * write path calls `findSlot` again inside its transaction to revalidate (never trust a cached
 * or client-side slot).
 */

const MINUTE = 60_000;

/** Wall-clock interval in minutes from local midnight, `[startMinute, endMinute)`, 0–1440. */
export interface WallInterval {
  startMinute: number;
  endMinute: number;
}

export interface WeeklyHours extends WallInterval {
  /** ISO weekday, Monday = 1 … Sunday = 7. */
  weekday: number;
}

/** Salon holiday or special-hours range (dates inclusive). */
export interface SalonHoliday {
  startDate: LocalDate;
  endDate: LocalDate;
  closed: boolean;
  /** Special opening hours for those days when not closed. */
  hours: WallInterval | null;
}

export interface StaffScheduleRule extends WeeklyHours {
  effectiveFrom: LocalDate;
  /** Inclusive; null = open-ended. */
  effectiveTo: LocalDate | null;
}

/** Recurring (weekday) or one-off (date) break; exactly one of the two is set. */
export interface StaffBreakRule extends WallInterval {
  weekday: number | null;
  date: LocalDate | null;
}

/** How long a booking occupies the staff member: buffers + appointment length. */
export interface OccupancyTerms {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export interface StaffAvailability {
  staffId: string;
  sortOrder: number;
  /**
   * Terms for the requested service as this staff member performs it (overrides applied). Used
   * only when `AvailabilityInput.lines` is omitted (single service); chains carry terms per line.
   */
  terms?: OccupancyTerms;
  schedules: readonly StaffScheduleRule[];
  breaks: readonly StaffBreakRule[];
  timeOff: readonly Interval[];
  /** Active occupancy (bookings and unexpired holds), buffers included. */
  busy: readonly Interval[];
}

export interface BookingRules {
  slotGranularityMinutes: number;
  minLeadMinutes: number;
  bookingWindowDays: number;
}

/**
 * Rules a salon member may override with `bookings.override_rules` (audited, spec 06 G15, q18).
 * Overlap is never overridable.
 */
export const RULE_OVERRIDES = ["hours", "lead_time", "horizon"] as const;
export type RuleOverride = (typeof RULE_OVERRIDES)[number];

export interface AvailabilityInput {
  timeZone: string;
  now: number;
  from: LocalDate;
  to: LocalDate;
  rules: BookingRules;
  openingHours: readonly WeeklyHours[];
  holidays: readonly SalonHoliday[];
  staff: readonly StaffAvailability[];
  /**
   * Units the service needs besides a staff member (M6.6); omitted = none. Never overridable.
   * With `lines`, only `units` (the pool, with busy time) is used; requirements come per line.
   */
  resources?: ResourceInput;
  /**
   * Service chain (M6.8). Omitted = one line built from `staff[].terms` and
   * `resources.requirements` (the single-service contract, a chain of one).
   */
  lines?: readonly ServiceLine[];
  overrides?: ReadonlySet<RuleOverride>;
}

export interface SlotOption {
  /** Staff of the first line. */
  staffId: string;
  /** Appointment start (first line) and end (last line) — what the customer sees. */
  start: number;
  end: number;
  /** Hull of every line's occupancy (single service: exactly its occupancy row). */
  occupancy: Interval;
  /** Every unit claimed by the chain (single service: its units). */
  unitIds: string[];
  /** One plan per service line, in order (single service: one). Write these to booking_occupancy. */
  lines: LinePlan[];
}

export interface Slot {
  start: number;
  /** One option per first-line staff member who can start the whole chain, best candidate first. */
  options: SlotOption[];
}

/** Longest window one availability call may cover (keeps request cost bounded). */
export const MAX_AVAILABILITY_DAYS = 31;

const wallToInterval = (date: LocalDate, w: WallInterval, tz: string): Interval => ({
  start: boundaryInstant(date, w.startMinute, tz, "start"),
  end: boundaryInstant(date, w.endMinute, tz, "end"),
});

function salonOpenIntervals(input: AvailabilityInput, date: LocalDate): Interval[] {
  if (input.overrides?.has("hours")) return [dayBounds(date, input.timeZone)];
  const holiday = input.holidays.find((h) => h.startDate <= date && date <= h.endDate);
  if (holiday) {
    return holiday.closed || !holiday.hours
      ? []
      : [wallToInterval(date, holiday.hours, input.timeZone)];
  }
  const weekday = isoWeekday(date);
  return normalize(
    input.openingHours
      .filter((h) => h.weekday === weekday)
      .map((h) => wallToInterval(date, h, input.timeZone)),
  );
}

function staffFreeIntervals(
  input: AvailabilityInput,
  staff: StaffAvailability,
  date: LocalDate,
  salonOpen: Interval[],
): Interval[] {
  const tz = input.timeZone;
  const weekday = isoWeekday(date);
  const working = input.overrides?.has("hours")
    ? [dayBounds(date, tz)]
    : staff.schedules
        .filter(
          (s) =>
            s.weekday === weekday &&
            s.effectiveFrom <= date &&
            (s.effectiveTo === null || date <= s.effectiveTo),
        )
        .map((s) => wallToInterval(date, s, tz));
  const breaks = staff.breaks
    .filter((b) => (b.date !== null ? b.date === date : b.weekday === weekday))
    .map((b) => wallToInterval(date, b, tz));
  return subtract(intersect(salonOpen, working), [...breaks, ...staff.timeOff, ...staff.busy]);
}

function compareCandidates(
  a: { s: StaffAvailability; load: number },
  b: { s: StaffAvailability; load: number },
): number {
  if (a.load !== b.load) return a.load - b.load;
  if (a.s.sortOrder !== b.s.sortOrder) return a.s.sortOrder - b.s.sortOrder;
  return a.s.staffId < b.s.staffId ? -1 : a.s.staffId > b.s.staffId ? 1 : 0;
}

function slotsForDate(input: AvailabilityInput, date: LocalDate, earliest: number): Slot[] {
  const lines = chainLines(input);
  if (lines.length === 0 || lines.length > MAX_SERVICE_LINES) return [];
  const salonOpen = salonOpenIntervals(input, date);
  if (salonOpen.length === 0) return [];
  const day = dayBounds(date, input.timeZone);
  const eligible = new Set(lines.flatMap((l) => [...l.staffTerms.keys()]));
  // "Any staff" preference: least booked that day, then sort order (spec 06 G11).
  const ranked = input.staff
    .filter((s) => eligible.has(s.staffId))
    .map((s) => ({
      s,
      free: staffFreeIntervals(input, s, date, salonOpen),
      load: overlapLength(s.busy, day),
    }))
    .filter((x) => x.free.length > 0)
    .sort(compareCandidates);
  const firstLine = lines[0] as ServiceLine;
  const firstStaff = ranked.filter((c) => firstLine.staffTerms.has(c.s.staffId));
  if (firstStaff.length === 0) return [];

  const slots: Slot[] = [];
  const empty: ChainClaims = { staff: [], units: [] };
  for (let minute = 0; minute < 1440; minute += input.rules.slotGranularityMinutes) {
    for (const start of instantsAt(date, minute, input.timeZone)) {
      if (start < earliest) continue;
      const options: SlotOption[] = [];
      for (const c of firstStaff) {
        const plan = planLines(input, lines, ranked, 0, start, null, empty, c.s.staffId);
        if (plan) options.push(toOption(plan));
      }
      if (options.length > 0) slots.push({ start, options });
    }
  }
  return slots;
}

/** Every bookable start in `[from, to]` (salon-local dates) with the staff who can take it. */
export function computeSlots(input: AvailabilityInput): Slot[] {
  // Check the span before allocating anything: callers pass request input (security review).
  if (!isLocalDate(input.from) || !isLocalDate(input.to)) throw new RangeError("invalid date");
  if (daysBetween(input.from, input.to) + 1 > MAX_AVAILABILITY_DAYS) {
    throw new RangeError(`availability window exceeds ${String(MAX_AVAILABILITY_DAYS)} days`);
  }
  const dates = datesBetween(input.from, input.to);
  const { rules, timeZone: tz, overrides } = input;
  if (rules.slotGranularityMinutes <= 0 || 1440 % rules.slotGranularityMinutes !== 0) {
    throw new RangeError("slot granularity must divide a day");
  }
  const today = toLocal(input.now, tz).date;
  const lastBookable = addDays(today, rules.bookingWindowDays);
  const earliest = overrides?.has("lead_time")
    ? dayBounds(today, tz).start
    : input.now + rules.minLeadMinutes * MINUTE;
  return dates
    .filter((date) => date >= today && (overrides?.has("horizon") || date <= lastBookable))
    .flatMap((date) => slotsForDate(input, date, earliest));
}

/**
 * Revalidation for the write path: the slot starting exactly at `start`, restricted to `staffId`
 * when given, or null when it is not bookable under the same rules.
 */
export function findSlot(
  input: Omit<AvailabilityInput, "from" | "to">,
  start: number,
  staffId: string | null,
): Slot | null {
  const date = toLocal(start, input.timeZone).date;
  const slot = computeSlots({ ...input, from: date, to: date }).find((s) => s.start === start);
  if (!slot) return null;
  const options = staffId ? slot.options.filter((o) => o.staffId === staffId) : slot.options;
  return options.length > 0 ? { start, options } : null;
}

/**
 * Which audited rule overrides (q18) would make `start` bookable for `staffId` (null = any staff):
 * `[]` when it already is, the smallest set (fewest overrides, then RULE_OVERRIDES order) when the
 * rules block it, or null when nothing helps — busy time, time off, breaks, missing resources
 * (overlap is never overridable). Drives the CRM's "book anyway?" prompt.
 */
export function requiredOverrides(
  input: Omit<AvailabilityInput, "from" | "to" | "overrides">,
  start: number,
  staffId: string | null,
  /** Only consider these (e.g. the ones a caller sent, to record just what was actually used). */
  allowed: readonly RuleOverride[] = RULE_OVERRIDES,
): RuleOverride[] | null {
  const subsets: RuleOverride[][] = [[]];
  for (const o of RULE_OVERRIDES.filter((r) => allowed.includes(r))) {
    for (const s of [...subsets]) subsets.push([...s, o]);
  }
  subsets.sort((a, b) => a.length - b.length);
  for (const subset of subsets) {
    if (findSlot({ ...input, overrides: new Set(subset) }, start, staffId)) return subset;
  }
  return null;
}
