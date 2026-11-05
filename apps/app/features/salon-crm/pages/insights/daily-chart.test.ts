import { describe, expect, it } from "vitest";

import { dailyChartData, dailyChartTicks } from "./daily-chart";

describe("appointments-per-day chart", () => {
  it("keeps empty dates between appointments and at both period edges", () => {
    expect(
      dailyChartData(
        [
          { date: "2026-10-31", appointments: 3, completed: 0, estimatedRevenue: 0 },
          { date: "2026-11-02", appointments: 1, completed: 0, estimatedRevenue: 0 },
        ],
        "2026-10-30",
        "2026-11-03",
      ),
    ).toEqual([
      { date: "2026-10-30", appointments: 0 },
      { date: "2026-10-31", appointments: 3 },
      { date: "2026-11-01", appointments: 0 },
      { date: "2026-11-02", appointments: 1 },
      { date: "2026-11-03", appointments: 0 },
    ]);
  });

  it("uses whole counts and a zero baseline even for empty or sparse periods", () => {
    for (const max of [0, 1, 3, 7, 11, 43, 101]) {
      const ticks = dailyChartTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(Math.max(1, max));
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(ticks.length).toBeLessThanOrEqual(5);
    }
  });
});
