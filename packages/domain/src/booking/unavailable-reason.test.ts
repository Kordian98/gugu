import { describe, expect, it } from "vitest";
import type { AvailabilityInput, StaffAvailability } from "./availability";
import { instantsAt } from "./tz";
import { unavailableReason } from "./unavailable-reason";

const HCM = "Asia/Ho_Chi_Minh";
const NOW = instantsAt("2026-11-02", 8 * 60, HCM)[0] as number;
const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startMinute: 540,
  endMinute: 1080,
}));
const staff = (patch: Partial<StaffAvailability> = {}): StaffAvailability => ({
  staffId: "a",
  sortOrder: 0,
  terms: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
  schedules: week.map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
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
  rules: { slotGranularityMinutes: 15, minLeadMinutes: 60, bookingWindowDays: 30 },
  openingHours: week,
  holidays: [],
  staff: [staff()],
  ...patch,
});

describe("unavailableReason", () => {
  it("no staff performs the service", () => {
    expect(unavailableReason(input({ staff: [] }))).toBe("no_staff_assigned");
  });
  it("assigned staff without working hours (or schedule ended before the range)", () => {
    expect(unavailableReason(input({ staff: [staff({ schedules: [] })] }))).toBe(
      "no_working_hours",
    );
    const ended = week.map((h) => ({
      ...h,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-10-01",
    }));
    expect(unavailableReason(input({ staff: [staff({ schedules: ended })] }))).toBe(
      "no_working_hours",
    );
  });
  it("salon without opening hours", () => {
    expect(unavailableReason(input({ openingHours: [] }))).toBe("no_working_hours");
  });
  it("range after the booking window, unless the horizon is overridden", () => {
    expect(unavailableReason(input({ from: "2026-12-20", to: "2026-12-20" }))).toBe(
      "outside_booking_window",
    );
    expect(
      unavailableReason(
        input({ from: "2026-12-20", to: "2026-12-20", overrides: new Set(["horizon"]) }),
      ),
    ).toBe("fully_booked");
  });
  it("otherwise the time is taken", () => {
    expect(unavailableReason(input())).toBe("fully_booked");
  });
});
