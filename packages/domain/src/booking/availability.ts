import { covers, intersect, type Interval, normalize, overlapLength, subtract } from "./intervals";
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
  /** Terms for the requested service as this staff member performs it (overrides applied). */
  terms: OccupancyTerms;
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
  overrides?: ReadonlySet<RuleOverride>;
}

export interface SlotOption {
  staffId: string;
  /** Appointment start/end (what the customer sees). */
  start: number;
  end: number;
  /** Time the staff member is blocked, buffers included — written to booking_occupancy. */
  occupancy: Interval;
}

export interface Slot {
  start: number;
  /** Staff who can take the slot, best "any staff" candidate first. */
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

function occupancyFor(start: number, terms: OccupancyTerms): Interval {
  return {
    start: start - terms.bufferBeforeMinutes * MINUTE,
    end: start + (terms.durationMinutes + terms.bufferAfterMinutes) * MINUTE,
  };
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
  const salonOpen = salonOpenIntervals(input, date);
  if (salonOpen.length === 0) return [];
  const day = dayBounds(date, input.timeZone);
  // "Any staff" preference: least booked that day, then sort order (spec 06 G11).
  const staff = input.staff
    .map((s) => ({
      s,
      free: staffFreeIntervals(input, s, date, salonOpen),
      load: overlapLength(s.busy, day),
    }))
    .filter((x) => x.free.length > 0)
    .sort(compareCandidates);
  if (staff.length === 0) return [];

  const slots: Slot[] = [];
  for (let minute = 0; minute < 1440; minute += input.rules.slotGranularityMinutes) {
    for (const start of instantsAt(date, minute, input.timeZone)) {
      if (start < earliest) continue;
      const options: SlotOption[] = [];
      for (const { s, free } of staff) {
        const occupancy = occupancyFor(start, s.terms);
        if (!covers(free, occupancy)) continue;
        options.push({
          staffId: s.staffId,
          start,
          end: start + s.terms.durationMinutes * MINUTE,
          occupancy,
        });
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
