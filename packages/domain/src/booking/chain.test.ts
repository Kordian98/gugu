import { describe, expect, it } from "vitest";
import {
  type AvailabilityInput,
  computeSlots,
  findSlot,
  type StaffAvailability,
  type WeeklyHours,
} from "./availability";
import { lineTiming, MAX_SERVICE_LINES, type OccupancyTerms, type ServiceLine } from "./chain";
import type { Interval } from "./intervals";
import { instantsAt, toLocal } from "./tz";
import { unavailableReason } from "./unavailable-reason";

/** Multi-service chains (M6.8): slot math for several services in sequence. */

const HCM = "Asia/Ho_Chi_Minh";
const NOW = instantsAt("2026-11-02", 8 * 60, HCM)[0] as number;
const DAY = "2026-11-03";
const at = (hh: number, mm = 0, date = DAY) => instantsAt(date, hh * 60 + mm, HCM)[0] as number;
const allWeek = (start: number, end: number): WeeklyHours[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: start * 60,
    endMinute: end * 60,
  }));

const staff = (id: string, patch: Partial<StaffAvailability> = {}): StaffAvailability => ({
  staffId: id,
  sortOrder: 0,
  schedules: allWeek(9, 18).map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy: [],
  ...patch,
});

const terms = (d: number, before = 0, after = 0): OccupancyTerms => ({
  durationMinutes: d,
  bufferBeforeMinutes: before,
  bufferAfterMinutes: after,
});

const line = (
  byStaff: Record<string, OccupancyTerms>,
  requirements: ServiceLine["requirements"] = [],
): ServiceLine => ({ staffTerms: new Map(Object.entries(byStaff)), requirements });

const input = (patch: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  timeZone: HCM,
  now: NOW,
  from: DAY,
  to: DAY,
  rules: { slotGranularityMinutes: 15, minLeadMinutes: 0, bookingWindowDays: 60 },
  openingHours: allWeek(9, 18),
  holidays: [],
  staff: [staff("a"), staff("b")],
  ...patch,
});

const minuteOf = (t: number) => toLocal(t, HCM).minute;

describe("lineTiming", () => {
  const t = terms(30, 5, 10);
  it("first line: starts at the slot, occupancy includes both buffers", () => {
    const r = lineTiming(null, "a", t, at(10));
    expect(r).toEqual({
      start: at(10),
      end: at(10, 30),
      occupancy: { start: at(9, 55), end: at(10, 40) },
    });
  });

  it("same staff: gap = max(after_prev, before_next), occupancy rows touch", () => {
    const prev = { staffId: "a", end: at(10, 30), bufferAfterMinutes: 10 };
    const r = lineTiming(prev, "a", terms(30, 15, 0), at(10));
    expect(r.start).toBe(at(10, 45)); // max(10, 15)
    expect(r.occupancy.start).toBe(at(10, 40)); // previous row ends at 10:40
    const r2 = lineTiming(prev, "a", terms(30, 5, 0), at(10));
    expect(r2.start).toBe(at(10, 40)); // max(10, 5)
  });

  it("another staff member: starts when the previous line ends, own prep runs before", () => {
    const prev = { staffId: "a", end: at(10, 30), bufferAfterMinutes: 10 };
    const r = lineTiming(prev, "b", terms(30, 15, 5), at(10));
    expect(r.start).toBe(at(10, 30));
    expect(r.occupancy).toEqual({ start: at(10, 15), end: at(11, 5) });
  });
});

describe("computeSlots with a service chain", () => {
  it("a chain of one is exactly the single-service result", () => {
    const single = input({
      staff: [
        staff("a", { terms: terms(45, 5, 10) }),
        staff("b", { terms: terms(30), busy: [{ start: at(11), end: at(12) }] }),
      ],
    });
    const chained = input({
      staff: single.staff,
      lines: [line({ a: terms(45, 5, 10), b: terms(30) })],
    });
    expect(computeSlots(chained)).toEqual(computeSlots(single));
  });

  it("same staff back-to-back: one person does gel nails then a pedicure", () => {
    const i = input({
      staff: [staff("a")],
      lines: [line({ a: terms(45, 0, 10) }), line({ a: terms(30, 5, 0) })],
    });
    const slot = findSlot(i, at(10), "a");
    const plan = slot?.options[0]?.lines;
    expect(plan?.map((l) => [l.staffId, minuteOf(l.start), minuteOf(l.end)])).toEqual([
      ["a", 600, 645],
      ["a", 655, 685], // 10:45 + max(10, 5)
    ]);
    expect(plan?.[0]?.occupancy.end).toBe(plan?.[1]?.occupancy.start);
    // The whole chain must end by 18:00: 45 + 10 + 30 = 85 min → last start 16:30.
    expect(computeSlots(i).at(-1)?.start).toBe(at(16, 30));
    expect(slot?.options[0]?.end).toBe(at(11, 25));
  });

  it("different staff: the second line starts when the first ends", () => {
    const i = input({
      lines: [line({ a: terms(45) }), line({ b: terms(30, 10) })],
    });
    const plan = findSlot(i, at(10), null)?.options[0]?.lines;
    expect(plan?.map((l) => [l.staffId, minuteOf(l.start), minuteOf(l.end)])).toEqual([
      ["a", 600, 645],
      ["b", 645, 675],
    ]);
    expect(plan?.[1]?.occupancy.start).toBe(at(10, 35));
  });

  it("offers only starts where the whole chain fits", () => {
    const i = input({
      staff: [staff("a"), staff("b", { busy: [{ start: at(10, 50), end: at(11, 10) }] })],
      lines: [line({ a: terms(45) }), line({ b: terms(30) })],
    });
    const offered = computeSlots(i).map((s) => minuteOf(s.start));
    // 10:00 → b busy 10:45–11:15; 10:15 too; 09:30 → b 10:15–10:45 free.
    expect(offered).toContain(9 * 60 + 30);
    expect(offered).not.toContain(10 * 60);
    expect(offered).not.toContain(10 * 60 + 15);
    expect(offered).not.toContain(9 * 60 + 45); // b 10:30–11:00 overlaps 10:50
    expect(offered).toContain(11 * 60 + 15); // b 12:00 free
  });

  it("any staff on the next line prefers the same person, else someone else", () => {
    const both = { a: terms(30), b: terms(30) };
    const free = input({ lines: [line({ a: terms(30) }), line(both)] });
    expect(findSlot(free, at(10), null)?.options[0]?.lines.map((l) => l.staffId)).toEqual([
      "a",
      "a",
    ]);
    const aBusyLater = input({
      staff: [staff("a", { busy: [{ start: at(10, 30), end: at(11) }] }), staff("b")],
      lines: [line({ a: terms(30) }), line(both)],
    });
    expect(findSlot(aBusyLater, at(10), null)?.options[0]?.lines.map((l) => l.staffId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("one option per first-line staff member who can start the chain", () => {
    const i = input({
      staff: [staff("a"), staff("b"), staff("c", { busy: [{ start: at(10, 30), end: at(11) }] })],
      lines: [line({ a: terms(30), c: terms(30) }), line({ b: terms(30) })],
    });
    expect(findSlot(i, at(10), null)?.options.map((o) => o.staffId)).toEqual(["a", "c"]);
    // c's own busy time does not block the line b does.
    expect(findSlot(i, at(10), "c")?.options[0]?.lines.map((l) => l.staffId)).toEqual(["c", "b"]);
  });

  it("a staff member twice in a chain never overlaps their own earlier line", () => {
    // a → b (5 min) → a with 30 min prep: a's third line would start prep before a's first ends.
    const i = input({
      lines: [line({ a: terms(30, 0, 20) }), line({ b: terms(5) }), line({ a: terms(30, 30) })],
    });
    expect(findSlot(i, at(10), "a")).toBeNull();
    const ok = input({
      lines: [line({ a: terms(30) }), line({ b: terms(30) }), line({ a: terms(30) })],
    });
    expect(findSlot(ok, at(10), "a")?.options[0]?.lines.map((l) => minuteOf(l.start))).toEqual([
      600, 630, 660,
    ]);
  });

  it("resources: each line claims its own units; earlier lines' units count as busy", () => {
    const chair = [{ resourceTypeId: "chair", quantity: 1 }];
    const units = (n: number) =>
      Array.from({ length: n }, (_, k) => ({
        unitId: `u${String(k + 1)}`,
        resourceTypeId: "chair",
        sortOrder: k,
        busy: [] as Interval[],
      }));
    // Same staff, contiguous rows: one chair is enough and is reused.
    const same = input({
      staff: [staff("a")],
      resources: { requirements: [], units: units(1) },
      lines: [line({ a: terms(30, 0, 10) }, chair), line({ a: terms(30) }, chair)],
    });
    expect(findSlot(same, at(10), "a")?.options[0]?.lines.map((l) => l.unitIds)).toEqual([
      ["u1"],
      ["u1"],
    ]);
    // Different staff, b preps during a's line: rows overlap, so a second chair is needed.
    const lines = [line({ a: terms(30) }, chair), line({ b: terms(30, 10) }, chair)];
    const one = input({ resources: { requirements: [], units: units(1) }, lines });
    expect(findSlot(one, at(10), null)).toBeNull();
    const two = input({ resources: { requirements: [], units: units(2) }, lines });
    expect(findSlot(two, at(10), null)?.options[0]?.lines.map((l) => l.unitIds)).toEqual([
      ["u1"],
      ["u2"],
    ]);
    expect(findSlot(two, at(10), null)?.options[0]?.unitIds).toEqual(["u1", "u2"]);
  });

  it("buffers of the chain must fit inside working hours", () => {
    const i = input({
      staff: [staff("a")],
      lines: [line({ a: terms(30, 10) }), line({ a: terms(30, 0, 15) })],
    });
    const first = computeSlots(i)[0]?.start;
    expect(first).toBe(at(9, 15)); // 10 min prep from 09:05 is not on the grid → 09:15
    // 30 + 30 + 15 after = 75 → the chain must start by 16:45.
    expect(computeSlots(i).at(-1)?.start).toBe(at(16, 45));
  });

  it("more lines than allowed are never offered", () => {
    const l = line({ a: terms(15) });
    const i = input({ lines: Array.from({ length: MAX_SERVICE_LINES + 1 }, () => l) });
    expect(computeSlots(i)).toEqual([]);
  });

  it("unavailableReason names a line nobody performs and a missing resource of any line", () => {
    const noStaff = input({ lines: [line({ a: terms(30) }), line({ z: terms(30) })] });
    expect(computeSlots(noStaff)).toEqual([]);
    expect(unavailableReason(noStaff)).toBe("no_staff_assigned");
    const noRoom = input({
      resources: { requirements: [], units: [] },
      lines: [
        line({ a: terms(30) }),
        line({ b: terms(30) }, [{ resourceTypeId: "r", quantity: 1 }]),
      ],
    });
    expect(computeSlots(noRoom)).toEqual([]);
    expect(unavailableReason(noRoom)).toBe("no_resource");
  });
});
