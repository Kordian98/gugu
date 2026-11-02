import { describe, expect, it } from "vitest";
import { resolvePeriod } from "./period";
import { utilization } from "./utilization";

const HCM = "Asia/Ho_Chi_Minh";
// Monday 2 Nov 2026, 23:30 in Ho Chi Minh City (16:30 UTC).
const now = Date.parse("2026-11-02T16:30:00Z");

describe("resolvePeriod", () => {
  it.each([
    ["today", "2026-11-02", "2026-11-02"],
    ["yesterday", "2026-11-01", "2026-11-01"],
    ["tomorrow", "2026-11-03", "2026-11-03"],
    ["this_week", "2026-11-02", "2026-11-08"],
    ["last_week", "2026-10-26", "2026-11-01"],
    ["next_week", "2026-11-09", "2026-11-15"],
    ["this_month", "2026-11-01", "2026-11-30"],
    ["last_month", "2026-10-01", "2026-10-31"],
    ["last_7_days", "2026-10-27", "2026-11-02"],
    ["last_30_days", "2026-10-04", "2026-11-02"],
  ] as const)("%s", (expr, from, to) => {
    expect(resolvePeriod(expr, now, HCM)).toEqual({ from, to });
  });

  it("uses the salon's local date, not UTC", () => {
    // 00:30 on 3 Nov in Ho Chi Minh City is still 2 Nov in UTC.
    expect(resolvePeriod("today", Date.parse("2026-11-02T17:30:00Z"), HCM)).toEqual({
      from: "2026-11-03",
      to: "2026-11-03",
    });
  });

  it("handles December → January", () => {
    expect(resolvePeriod("this_month", Date.parse("2026-12-15T05:00:00Z"), HCM)).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(resolvePeriod("last_month", Date.parse("2027-01-15T05:00:00Z"), HCM)).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });
});

describe("utilization", () => {
  const at = (local: string) => Date.parse(`${local}:00+07:00`);
  const schedules = [
    // Monday 09:00–17:00
    {
      weekday: 1,
      startMinute: 540,
      endMinute: 1020,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    },
  ];
  const breaks = [{ weekday: 1, date: null, startMinute: 720, endMinute: 780 }]; // 12:00–13:00

  it("is booked ÷ scheduled minutes after breaks and time off", () => {
    const r = utilization(
      {
        schedules,
        breaks,
        timeOff: [{ start: at("2026-11-02T15:00"), end: at("2026-11-02T17:00") }],
        booked: [
          { start: at("2026-11-02T09:00"), end: at("2026-11-02T10:30") },
          { start: at("2026-11-02T11:30"), end: at("2026-11-02T12:30") }, // half in the break
        ],
      },
      "2026-11-02",
      "2026-11-08",
      HCM,
    );
    // 8h − 1h break − 2h time off = 5h; booked 1.5h + 0.5h = 2h.
    expect(r).toEqual({ scheduledMinutes: 300, bookedMinutes: 120, utilizationPercent: 40 });
  });

  it("is null when nobody was scheduled", () => {
    expect(
      utilization({ schedules, breaks, timeOff: [], booked: [] }, "2026-11-03", "2026-11-03", HCM),
    ).toEqual({ scheduledMinutes: 0, bookedMinutes: 0, utilizationPercent: null });
  });
});
