import { describe, expect, it } from "vitest";
import {
  type AvailabilityInput,
  computeSlots,
  findSlot,
  type StaffAvailability,
  type WeeklyHours,
} from "./availability";
import type { Interval } from "./intervals";
import { instantsAt, toLocal } from "./tz";

const HCM = "Asia/Ho_Chi_Minh";
const M = 60_000;
// Monday 2026-11-02, 08:00 local.
const NOW = instantsAt("2026-11-02", 8 * 60, HCM)[0] as number;
const at = (date: string, hh: number, mm = 0, tz = HCM) =>
  instantsAt(date, hh * 60 + mm, tz)[0] as number;
const allWeek = (start: number, end: number): WeeklyHours[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: start * 60,
    endMinute: end * 60,
  }));

const staff = (id: string, patch: Partial<StaffAvailability> = {}): StaffAvailability => ({
  staffId: id,
  sortOrder: 0,
  terms: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
  schedules: allWeek(9, 18).map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy: [],
  ...patch,
});

const input = (patch: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  timeZone: HCM,
  now: NOW,
  from: "2026-11-03",
  to: "2026-11-03",
  rules: { slotGranularityMinutes: 15, minLeadMinutes: 60, bookingWindowDays: 60 },
  openingHours: allWeek(9, 18),
  holidays: [],
  staff: [staff("a")],
  ...patch,
});

const starts = (i: AvailabilityInput) => computeSlots(i).map((s) => toLocal(s.start, i.timeZone));
const minutes = (i: AvailabilityInput) => starts(i).map((s) => s.minute);

describe("computeSlots", () => {
  it("offers grid starts inside opening hours where the service fits", () => {
    const m = minutes(input());
    expect(m[0]).toBe(9 * 60);
    expect(m.at(-1)).toBe(17 * 60 + 30); // 30 min must end by 18:00
    expect(m).toHaveLength((17.5 - 9) * 4 + 1);
  });

  it("buffers: 30 min + 10 min after-buffer blocks the next start until 10:40 (5-min grid)", () => {
    const busyStart = at("2026-11-03", 10);
    const i = input({
      rules: { slotGranularityMinutes: 5, minLeadMinutes: 0, bookingWindowDays: 60 },
      staff: [
        staff("a", {
          terms: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 10 },
          busy: [{ start: busyStart, end: busyStart + 40 * M }],
        }),
      ],
    });
    const m = minutes(i);
    expect(m).toContain(10 * 60 + 40);
    expect(m).not.toContain(10 * 60 + 35);
    // A start at 09:25 would end (incl. buffer) at 10:05 → overlaps the busy block.
    expect(m).toContain(9 * 60 + 20);
    expect(m).not.toContain(9 * 60 + 25);
  });

  it("buffer before must also fit inside working hours", () => {
    const i = input({
      staff: [
        staff("a", {
          terms: { durationMinutes: 30, bufferBeforeMinutes: 15, bufferAfterMinutes: 0 },
        }),
      ],
    });
    expect(minutes(i)[0]).toBe(9 * 60 + 15);
  });

  it("excludes breaks, time off, holidays and respects special hours", () => {
    const off: Interval = { start: at("2026-11-03", 14), end: at("2026-11-03", 18) };
    const i = input({
      staff: [
        staff("a", {
          breaks: [
            { weekday: 2, date: null, startMinute: 12 * 60, endMinute: 13 * 60 },
            { weekday: null, date: "2026-11-03", startMinute: 9 * 60, endMinute: 10 * 60 },
            { weekday: null, date: "2026-11-04", startMinute: 10 * 60, endMinute: 11 * 60 },
          ],
          timeOff: [off],
        }),
      ],
    });
    const m = minutes(i);
    expect(m[0]).toBe(10 * 60);
    expect(m).not.toContain(11 * 60 + 45);
    expect(m).toContain(13 * 60);
    expect(m.at(-1)).toBe(13 * 60 + 30);

    const closed = input({
      holidays: [{ startDate: "2026-11-03", endDate: "2026-11-04", closed: true, hours: null }],
    });
    expect(computeSlots(closed)).toEqual([]);
    const special = input({
      holidays: [
        {
          startDate: "2026-11-03",
          endDate: "2026-11-03",
          closed: false,
          hours: { startMinute: 10 * 60, endMinute: 12 * 60 },
        },
      ],
    });
    expect(minutes(special)[0]).toBe(10 * 60);
    expect(minutes(special).at(-1)).toBe(11 * 60 + 30);
  });

  it("schedules honour weekday and effective dates", () => {
    const i = input({
      from: "2026-11-02",
      to: "2026-11-08",
      rules: { slotGranularityMinutes: 60, minLeadMinutes: 0, bookingWindowDays: 60 },
      staff: [
        staff("a", {
          schedules: [
            {
              weekday: 3,
              startMinute: 9 * 60,
              endMinute: 11 * 60,
              effectiveFrom: "2026-01-01",
              effectiveTo: "2026-11-04",
            },
            {
              weekday: 4,
              startMinute: 9 * 60,
              endMinute: 11 * 60,
              effectiveFrom: "2026-11-06",
              effectiveTo: null,
            },
          ],
        }),
      ],
    });
    expect([...new Set(starts(i).map((s) => s.date))]).toEqual(["2026-11-04"]);
  });

  it("lead time and booking window, and the past is never offered", () => {
    const lead = input({ from: "2026-11-02", to: "2026-11-02" });
    expect(minutes(lead)[0]).toBe(9 * 60); // now 08:00 + 60 min lead
    const lead3h = input({
      from: "2026-11-02",
      to: "2026-11-02",
      rules: { slotGranularityMinutes: 15, minLeadMinutes: 180, bookingWindowDays: 60 },
    });
    expect(minutes(lead3h)[0]).toBe(11 * 60);
    expect(computeSlots(input({ from: "2026-11-01", to: "2026-11-01" }))).toEqual([]);
    const window = input({
      from: "2026-11-04",
      to: "2026-11-06",
      rules: { slotGranularityMinutes: 15, minLeadMinutes: 0, bookingWindowDays: 3 },
    });
    expect([...new Set(starts(window).map((s) => s.date))]).toEqual(["2026-11-04", "2026-11-05"]);
  });

  it("overrides (audited CRM entries) lift hours, lead time and horizon — never busy time", () => {
    const busy = { start: at("2026-11-02", 20), end: at("2026-11-02", 21) };
    const i = input({
      from: "2026-11-02",
      to: "2026-11-02",
      staff: [staff("a", { busy: [busy] })],
      overrides: new Set(["hours", "lead_time"] as const),
    });
    const m = minutes(i);
    expect(m[0]).toBe(0);
    expect(m).toContain(19 * 60);
    expect(m).not.toContain(20 * 60);
    expect(m).toContain(23 * 60 + 30);
    const far = input({
      from: "2027-03-01",
      to: "2027-03-01",
      overrides: new Set(["horizon"] as const),
    });
    expect(computeSlots(far).length).toBeGreaterThan(0);
    expect(computeSlots({ ...far, overrides: new Set() })).toEqual([]);
  });

  it("any staff: least-booked that day first, then sort order; per-staff durations", () => {
    const busyB = { start: at("2026-11-03", 16), end: at("2026-11-03", 17) };
    const i = input({
      staff: [
        staff("b", { sortOrder: 0, busy: [busyB] }),
        staff("c", { sortOrder: 2 }),
        staff("a", {
          sortOrder: 1,
          terms: { durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
        }),
      ],
    });
    const first = computeSlots(i)[0];
    expect(first?.options.map((o) => o.staffId)).toEqual(["a", "c", "b"]);
    expect(first?.options[0]?.end).toBe((first?.start ?? 0) + 60 * M);
    const last = computeSlots(i).at(-1);
    expect(last?.options.map((o) => o.staffId)).toEqual(["c", "b"]); // a's 60 min does not fit
  });

  it("validates the window and granularity", () => {
    expect(() => computeSlots(input({ from: "2026-11-03", to: "2026-12-31" }))).toThrow(RangeError);
    // A huge range is rejected before any per-day work (security review: no O(range) allocation).
    const started = Date.now();
    expect(() => computeSlots(input({ from: "0001-01-01", to: "9999-12-31" }))).toThrow(RangeError);
    expect(Date.now() - started).toBeLessThan(50);
    expect(() => computeSlots(input({ from: "2026-02-30", to: "2026-03-01" }))).toThrow(RangeError);
    expect(computeSlots(input({ from: "2026-11-04", to: "2026-11-03" }))).toEqual([]);
    expect(() =>
      computeSlots(
        input({ rules: { slotGranularityMinutes: 7, minLeadMinutes: 0, bookingWindowDays: 1 } }),
      ),
    ).toThrow(RangeError);
    expect(computeSlots(input({ staff: [] }))).toEqual([]);
    expect(computeSlots(input({ openingHours: [] }))).toEqual([]);
  });

  it("DST: spring-forward start never offered, fall-back day offers the repeated hour twice", () => {
    const WAW = "Europe/Warsaw";
    const base = (date: string): AvailabilityInput =>
      input({
        timeZone: WAW,
        now: Date.UTC(2026, 0, 1),
        from: date,
        to: date,
        rules: { slotGranularityMinutes: 30, minLeadMinutes: 0, bookingWindowDays: 400 },
        openingHours: allWeek(0, 24),
        staff: [
          staff("a", {
            schedules: allWeek(0, 24).map((h) => ({
              ...h,
              effectiveFrom: "2026-01-01",
              effectiveTo: null,
            })),
          }),
        ],
      });
    const spring = computeSlots(base("2026-03-29"));
    expect(spring.map((s) => toLocal(s.start, WAW).minute)).not.toContain(150);
    expect(spring).toHaveLength(46); // 23 h day; the 23:30 slot ends exactly at midnight
    const fall = computeSlots(base("2026-10-25"));
    expect(fall).toHaveLength(50); // 25 h day
    expect(fall.filter((s) => toLocal(s.start, WAW).minute === 150)).toHaveLength(2);
  });
});

describe("findSlot", () => {
  it("revalidates one start, optionally for one staff member", () => {
    const i = input({ staff: [staff("a"), staff("b", { sortOrder: 1 })] });
    const start = at("2026-11-03", 10);
    expect(findSlot(i, start, null)?.options.map((o) => o.staffId)).toEqual(["a", "b"]);
    expect(findSlot(i, start, "b")?.options.map((o) => o.staffId)).toEqual(["b"]);
    expect(findSlot(i, start, "zzz")).toBeNull();
    expect(findSlot(i, start + 5 * M, null)).toBeNull(); // off-grid
    expect(findSlot(i, at("2026-11-03", 20), null)).toBeNull();
  });
});
