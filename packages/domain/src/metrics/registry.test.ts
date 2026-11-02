import { describe, expect, it } from "vitest";
import { METRICS, METRIC_KEYS, previousPeriod, ratio } from "./registry";

describe("metric catalogue", () => {
  it("money metrics always carry a revenue kind", () => {
    for (const key of METRIC_KEYS) {
      const m = METRICS[key];
      if (m.unit === "vnd") expect("revenueKind" in m && m.revenueKind).toBeTruthy();
    }
  });
  it("computes the previous period of equal length", () => {
    expect(previousPeriod("2026-11-01", "2026-11-30")).toEqual({
      from: "2026-10-02",
      to: "2026-10-31",
    });
    expect(previousPeriod("2026-11-03", "2026-11-03")).toEqual({
      from: "2026-11-02",
      to: "2026-11-02",
    });
  });
  it("ratios are null without a denominator", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});
