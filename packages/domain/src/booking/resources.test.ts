import { describe, expect, it } from "vitest";
import {
  type AvailabilityInput,
  computeSlots,
  findSlot,
  type StaffAvailability,
} from "./availability";
import { pickUnits, type ResourceInput } from "./resources";
import { instantsAt, toLocal } from "./tz";

const HCM = "Asia/Ho_Chi_Minh";
const M = 60_000;
const at = (hh: number, mm = 0) => instantsAt("2026-11-03", hh * 60 + mm, HCM)[0] as number;
const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startMinute: 540,
  endMinute: 1080,
}));
const staff = (id: string, sortOrder = 0): StaffAvailability => ({
  staffId: id,
  sortOrder,
  terms: { durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 15 },
  schedules: week.map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy: [],
});
const input = (resources: ResourceInput): AvailabilityInput => ({
  timeZone: HCM,
  now: instantsAt("2026-11-02", 480, HCM)[0] as number,
  from: "2026-11-03",
  to: "2026-11-03",
  rules: { slotGranularityMinutes: 15, minLeadMinutes: 0, bookingWindowDays: 30 },
  openingHours: week,
  holidays: [],
  staff: [staff("a"), staff("b", 1)],
  resources,
});
const bed = (unitId: string, sortOrder: number, busy: { start: number; end: number }[] = []) => ({
  unitId,
  resourceTypeId: "bed",
  sortOrder,
  busy,
});
const needs = (quantity = 1) => [{ resourceTypeId: "bed", quantity }];

describe("pickUnits", () => {
  const occ = { start: at(10), end: at(11, 15) };
  it("no requirements → no units needed", () => {
    expect(pickUnits(undefined, occ)).toEqual([]);
    expect(pickUnits({ requirements: [], units: [] }, occ)).toEqual([]);
  });
  it("first free units in sort order; null when too few", () => {
    const units = [bed("u2", 1), bed("u1", 0, [{ start: at(11), end: at(12) }]), bed("u3", 1)];
    expect(pickUnits({ requirements: needs(), units }, occ)).toEqual(["u2"]);
    expect(pickUnits({ requirements: needs(2), units }, occ)).toEqual(["u2", "u3"]);
    expect(pickUnits({ requirements: needs(3), units }, occ)).toBeNull();
    expect(pickUnits({ requirements: needs(), units: [] }, occ)).toBeNull();
    // Back-to-back (half-open) does not conflict.
    expect(
      pickUnits(
        { requirements: needs(), units: [bed("u1", 0, [{ start: at(9), end: at(10) }])] },
        occ,
      ),
    ).toEqual(["u1"]);
  });
});

describe("computeSlots with resources", () => {
  it("two staff free but one bed: every option needs the bed, busy bed removes the slot", () => {
    const busyBed = bed("u1", 0, [{ start: at(10), end: at(11, 15) }]);
    const slots = computeSlots(input({ requirements: needs(), units: [busyBed] }));
    const minutes = slots.map((s) => toLocal(s.start, HCM).minute);
    expect(minutes).not.toContain(600); // 10:00 bed taken although both staff are free
    expect(minutes).not.toContain(9 * 60); // 09:00–10:15 overlaps the bed's 10:00 claim
    expect(minutes).toContain(11 * 60 + 15);
    const slot = slots.find((s) => s.start === at(12));
    expect(slot?.options.map((o) => [o.staffId, o.unitIds])).toEqual([
      ["a", ["u1"]],
      ["b", ["u1"]],
    ]);
  });
  it("capacity 2 = two units; findSlot revalidates units too", () => {
    const u2 = bed("u2", 1, [{ start: at(10), end: at(11) }]);
    const res = {
      requirements: needs(),
      units: [bed("u1", 0), u2],
    };
    expect(findSlot(input(res), at(10), "b")?.options[0]?.unitIds).toEqual(["u1"]);
    const full = {
      ...res,
      units: [bed("u1", 0, [{ start: at(10), end: at(10, 30) }]), u2],
    };
    expect(findSlot(input(full), at(10), null)).toBeNull();
  });
  it("a service without requirements ignores units", () => {
    const slots = computeSlots(input({ requirements: [], units: [] }));
    expect(slots[0]?.options[0]?.unitIds).toEqual([]);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]?.start).toBe(at(9));
    expect((slots[0]?.options[0]?.end ?? 0) - (slots[0]?.start ?? 0)).toBe(60 * M);
  });
});
