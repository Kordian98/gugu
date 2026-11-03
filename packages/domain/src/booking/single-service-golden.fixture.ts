import type { AvailabilityInput, Slot, StaffAvailability, WeeklyHours } from "./availability";
import { instantsAt, toLocal } from "./tz";

/**
 * Single-service inputs for the M6.8 regression guard (`single-service-golden.test.ts`). The golden
 * file was produced by running these inputs through `computeSlots` on `main` before multi-service
 * chains landed (merge base 1ea48fd): a single service must give exactly the same slots and options.
 * Keep this file free of chain-only fields so it runs unchanged against the pre-M6.8 engine.
 */

const allWeek = (start: number, end: number): WeeklyHours[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: start * 60,
    endMinute: end * 60,
  }));

const schedule = (start: number, end: number) =>
  allWeek(start, end).map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null }));

const terms = (d: number, before = 0, after = 0) => ({
  durationMinutes: d,
  bufferBeforeMinutes: before,
  bufferAfterMinutes: after,
});

const at = (date: string, hh: number, mm: number, tz: string) =>
  instantsAt(date, hh * 60 + mm, tz)[0] as number;

function hcm(): AvailabilityInput {
  const tz = "Asia/Ho_Chi_Minh";
  const d1 = "2026-11-03";
  const d2 = "2026-11-04";
  const t = (hh: number, mm = 0, date = d1) => at(date, hh, mm, tz);
  const staff: StaffAvailability[] = [
    {
      staffId: "a",
      sortOrder: 1,
      terms: terms(45, 5, 10),
      schedules: schedule(9, 18),
      breaks: [{ weekday: null, date: d1, startMinute: 12 * 60, endMinute: 13 * 60 }],
      timeOff: [],
      busy: [{ start: t(14), end: t(15) }],
    },
    {
      staffId: "b",
      sortOrder: 0,
      terms: terms(30, 0, 15),
      schedules: schedule(10, 17),
      breaks: [],
      timeOff: [{ start: t(16, 0, d2), end: t(17, 0, d2) }],
      busy: [
        { start: t(10), end: t(10, 30) },
        { start: t(11), end: t(11, 45) },
      ],
    },
  ];
  return {
    timeZone: tz,
    now: t(8, 50),
    from: d1,
    to: d2,
    rules: { slotGranularityMinutes: 15, minLeadMinutes: 30, bookingWindowDays: 60 },
    openingHours: allWeek(9, 18),
    holidays: [
      { startDate: d2, endDate: d2, closed: false, hours: { startMinute: 600, endMinute: 900 } },
    ],
    staff,
    resources: {
      requirements: [{ resourceTypeId: "chair", quantity: 1 }],
      units: [
        {
          unitId: "u1",
          resourceTypeId: "chair",
          sortOrder: 0,
          busy: [
            { start: t(9), end: t(11) },
            { start: t(13), end: t(15) },
          ],
        },
        {
          unitId: "u2",
          resourceTypeId: "chair",
          sortOrder: 1,
          busy: [{ start: t(10), end: t(13) }],
        },
      ],
    },
  };
}

/** DST: Europe/Warsaw falls back on 2026-10-25 (03:00 → 02:00, the 02:xx hour happens twice). */
function warsawFallBack(): AvailabilityInput {
  const tz = "Europe/Warsaw";
  const day = "2026-10-25";
  return {
    timeZone: tz,
    now: at("2026-10-24", 12, 0, tz),
    from: day,
    to: day,
    rules: { slotGranularityMinutes: 30, minLeadMinutes: 0, bookingWindowDays: 30 },
    openingHours: allWeek(1, 5),
    holidays: [],
    staff: [
      {
        staffId: "a",
        sortOrder: 0,
        terms: terms(60, 0, 15),
        schedules: schedule(1, 5),
        breaks: [],
        timeOff: [],
        busy: [],
      },
    ],
  };
}

/** DST: Europe/Warsaw springs forward on 2026-03-29 (02:00 → 03:00, no 02:xx). */
function warsawSpringForward(): AvailabilityInput {
  const tz = "Europe/Warsaw";
  const day = "2026-03-29";
  return {
    timeZone: tz,
    now: at("2026-03-28", 12, 0, tz),
    from: day,
    to: day,
    rules: { slotGranularityMinutes: 30, minLeadMinutes: 0, bookingWindowDays: 30 },
    openingHours: allWeek(1, 5),
    holidays: [],
    staff: [
      {
        staffId: "a",
        sortOrder: 0,
        terms: terms(45, 10, 0),
        schedules: schedule(1, 5),
        breaks: [],
        timeOff: [],
        busy: [],
      },
    ],
    overrides: new Set(["hours"]),
  };
}

export const GOLDEN_CASES: Record<string, () => AvailabilityInput> = {
  hcm,
  warsawFallBack,
  warsawSpringForward,
};

/**
 * One readable line per slot: local start (with UTC), then each option as
 * `staff end occ=[start,end) units`. Readable diffs when the guard fails.
 */
export function describeSlots(slots: readonly Slot[], tz: string): string[] {
  const local = (ms: number) => {
    const l = toLocal(ms, tz);
    const hh = String(Math.floor(l.minute / 60)).padStart(2, "0");
    const mm = String(l.minute % 60).padStart(2, "0");
    return `${l.date} ${hh}:${mm}`;
  };
  return slots.map(
    (s) =>
      `${local(s.start)} (${new Date(s.start).toISOString()}) → ` +
      s.options
        .map(
          (o) =>
            `${o.staffId} end=${local(o.end)} occ=[${new Date(o.occupancy.start).toISOString()},${new Date(o.occupancy.end).toISOString()}) units=${o.unitIds.join("+") || "-"}`,
        )
        .join(" | "),
  );
}
