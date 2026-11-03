import { describe, expect, it } from "vitest";
import { freeYearEnd, isInFreeYear } from "./free-year";

const VN = "Asia/Ho_Chi_Minh";

describe("freeYearEnd (X25: Basic free for 12 months from registration)", () => {
  it("ends at the local midnight after the registration date + 12 months", () => {
    // Registered 3 Nov 2026 15:00 in Vietnam → free through 3 Nov 2027 (local).
    expect(freeYearEnd(new Date("2026-11-03T08:00:00Z"), VN).toISOString()).toBe(
      "2027-11-03T17:00:00.000Z",
    );
  });

  it("uses the salon's calendar date, not the UTC one", () => {
    // 3 Nov 2026 23:30 UTC is already 4 Nov 06:30 in Vietnam.
    expect(freeYearEnd(new Date("2026-11-03T23:30:00Z"), VN).toISOString()).toBe(
      "2027-11-04T17:00:00.000Z",
    );
    // 4 Nov 2026 00:30 in Vietnam is still 3 Nov in UTC.
    expect(freeYearEnd(new Date("2026-11-03T17:30:00Z"), VN).toISOString()).toBe(
      "2027-11-04T17:00:00.000Z",
    );
    // Same instant as above, in UTC the registration day is 3 Nov.
    expect(freeYearEnd(new Date("2026-11-03T17:30:00Z"), "UTC").toISOString()).toBe(
      "2027-11-04T00:00:00.000Z",
    );
  });

  it("is DST-safe (Europe/Warsaw: the end is local midnight in summer time)", () => {
    // Registered 10 Jun 2026 in Warsaw (CEST, UTC+2) → ends 11 Jun 2027 00:00 CEST.
    expect(freeYearEnd(new Date("2026-06-10T10:00:00Z"), "Europe/Warsaw").toISOString()).toBe(
      "2027-06-10T22:00:00.000Z",
    );
    // Registered in winter (CET, UTC+1).
    expect(freeYearEnd(new Date("2026-01-15T10:00:00Z"), "Europe/Warsaw").toISOString()).toBe(
      "2027-01-15T23:00:00.000Z",
    );
  });

  it("clamps a day missing in the target month (29 Feb → 28 Feb), like Postgres", () => {
    expect(freeYearEnd(new Date("2028-02-29T05:00:00Z"), VN).toISOString()).toBe(
      "2029-02-28T17:00:00.000Z",
    );
  });

  it("the boundary is exclusive: free until the instant before, not at it", () => {
    const end = freeYearEnd(new Date("2026-11-03T08:00:00Z"), VN);
    expect(isInFreeYear(end, new Date(end.getTime() - 1))).toBe(true);
    expect(isInFreeYear(end, end)).toBe(false);
    expect(isInFreeYear(null, new Date())).toBe(false);
  });
});
