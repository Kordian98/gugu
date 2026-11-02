import { describe, expect, it } from "vitest";
import {
  fromDateColumn,
  fromTimeColumn,
  localDate,
  toDateColumn,
  toTimeColumn,
} from "./wall-clock";

describe("wall clock", () => {
  it("round-trips time and date columns", () => {
    expect(fromTimeColumn(toTimeColumn("09:30"))).toBe("09:30");
    expect(fromTimeColumn(toTimeColumn("23:59"))).toBe("23:59");
    expect(fromDateColumn(toDateColumn("2026-02-01"))).toBe("2026-02-01");
  });
  it("computes the local date in the salon timezone", () => {
    const lateUtc = new Date("2026-11-02T18:30:00Z"); // 01:30 on Nov 3 in Ho Chi Minh City
    expect(localDate(lateUtc, "Asia/Ho_Chi_Minh")).toBe("2026-11-03");
    expect(localDate(lateUtc, "Europe/Warsaw")).toBe("2026-11-02");
  });
});
