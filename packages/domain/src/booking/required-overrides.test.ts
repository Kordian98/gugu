import { describe, expect, it } from "vitest";
import { type AvailabilityInput, requiredOverrides, type StaffAvailability } from "./availability";
import { instantsAt } from "./tz";

const HCM = "Asia/Ho_Chi_Minh";
const at = (date: string, hh: number, mm = 0) => instantsAt(date, hh * 60 + mm, HCM)[0] as number;
const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startMinute: 540,
  endMinute: 1080,
}));
const staff: StaffAvailability = {
  staffId: "a",
  sortOrder: 0,
  terms: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
  schedules: week.map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy: [{ start: at("2026-11-03", 12), end: at("2026-11-03", 13) }],
};
const input: Omit<AvailabilityInput, "from" | "to" | "overrides"> = {
  timeZone: HCM,
  now: at("2026-11-03", 8),
  rules: { slotGranularityMinutes: 15, minLeadMinutes: 120, bookingWindowDays: 30 },
  openingHours: week,
  holidays: [],
  staff: [staff],
};

describe("requiredOverrides", () => {
  it("[] when bookable, the smallest needed set otherwise, null when blocked", () => {
    expect(requiredOverrides(input, at("2026-11-03", 14), null)).toEqual([]);
    expect(requiredOverrides(input, at("2026-11-03", 19), "a")).toEqual(["hours"]);
    expect(requiredOverrides(input, at("2026-11-03", 9), "a")).toEqual(["lead_time"]);
    expect(requiredOverrides(input, at("2026-12-20", 10), "a")).toEqual(["horizon"]);
    expect(requiredOverrides(input, at("2026-12-20", 20), "a")).toEqual(["hours", "horizon"]);
    expect(requiredOverrides(input, at("2026-11-03", 12, 15), "a")).toBeNull(); // busy
    expect(requiredOverrides(input, at("2026-11-03", 14), "zzz")).toBeNull();
  });
  it("restricted to allowed overrides: what a caller actually needed among those it sent", () => {
    const evening = at("2026-11-03", 19);
    expect(requiredOverrides(input, evening, "a", ["hours", "lead_time"])).toEqual(["hours"]);
    expect(requiredOverrides(input, evening, "a", ["lead_time"])).toBeNull();
    expect(requiredOverrides(input, at("2026-11-03", 14), "a", ["hours"])).toEqual([]);
  });
});
