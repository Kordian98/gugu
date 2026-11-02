import { describe, expect, it } from "vitest";
import {
  addDays,
  assertTimeZone,
  boundaryInstant,
  datesBetween,
  dayBounds,
  instantsAt,
  isoWeekday,
  offsetMinutesAt,
  toLocal,
} from "./tz";

const HCM = "Asia/Ho_Chi_Minh";
const WAW = "Europe/Warsaw";
const NYC = "America/New_York";
const H = 3_600_000;

describe("tz", () => {
  it("Ho Chi Minh is UTC+7 all year", () => {
    expect(offsetMinutesAt(Date.UTC(2026, 0, 1), HCM)).toBe(420);
    expect(offsetMinutesAt(Date.UTC(2026, 6, 1), HCM)).toBe(420);
    expect(instantsAt("2026-11-03", 9 * 60, HCM)).toEqual([Date.UTC(2026, 10, 3, 2)]);
    expect(toLocal(Date.UTC(2026, 10, 3, 17, 30), HCM)).toEqual({ date: "2026-11-04", minute: 30 });
  });

  it("spring-forward gap has no instants; boundaries jump to the new time", () => {
    // Warsaw 2026-03-29: 02:00 → 03:00.
    expect(instantsAt("2026-03-29", 150, WAW)).toEqual([]);
    expect(boundaryInstant("2026-03-29", 150, WAW, "start")).toBe(Date.UTC(2026, 2, 29, 1));
    expect(dayBounds("2026-03-29", WAW).end - dayBounds("2026-03-29", WAW).start).toBe(23 * H);
    // New York 2026-03-08.
    expect(instantsAt("2026-03-08", 150, NYC)).toEqual([]);
  });

  it("fall-back overlap has two instants; edge picks earliest or latest", () => {
    // Warsaw 2026-10-25: 03:00 → 02:00.
    const both = instantsAt("2026-10-25", 150, WAW);
    expect(both).toEqual([Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30)]);
    expect(boundaryInstant("2026-10-25", 150, WAW, "start")).toBe(both[0]);
    expect(boundaryInstant("2026-10-25", 150, WAW, "end")).toBe(both[1]);
    expect(dayBounds("2026-10-25", WAW).end - dayBounds("2026-10-25", WAW).start).toBe(25 * H);
  });

  it("minute 1440 is the next midnight", () => {
    expect(instantsAt("2026-11-03", 1440, HCM)).toEqual(instantsAt("2026-11-04", 0, HCM));
  });

  it("calendar helpers", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
    expect(datesBetween("2026-11-30", "2026-12-02")).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(datesBetween("2026-12-02", "2026-11-30")).toEqual([]);
    expect(() => addDays("2026-1-1", 1)).toThrow(/invalid local date/);
    expect(() => {
      assertTimeZone("Mars/Base");
    }).toThrow();
    expect(() => {
      assertTimeZone(HCM);
    }).not.toThrow();
  });
});
