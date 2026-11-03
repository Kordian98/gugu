import { describe, expect, it } from "vitest";
import { monthProfit, noShowAssumption } from "./profit";

describe("month profit", () => {
  it("adds up actual and projected parts", () => {
    const p = monthProfit({
      earned: 30_000_000,
      earnedRecorded: 10_000_000,
      upcoming: 20_000_000,
      noShowRate: 0.1,
      serviceCostsActual: 3_000_000,
      serviceCostsUpcoming: 2_000_000,
      basePay: 15_000_000,
      commissionEarned: 3_000_000,
      commissionUpcoming: 2_000_000,
      adjustments: 500_000,
      otherCosts: 12_000_000,
      elapsedDays: 15,
      daysInMonth: 30,
    });
    expect(p.noShowAllowance).toBe(2_000_000);
    expect(p.revenueTotal).toBe(48_000_000);
    expect(p.serviceCosts).toBe(4_800_000);
    expect(p.commissionProjected).toBe(1_800_000);
    expect(p.payroll).toBe(15_000_000 + 3_000_000 + 1_800_000 + 500_000);
    expect(p.netProfit).toBe(48_000_000 - 4_800_000 - 20_300_000 - 12_000_000);
    expect(p.grossMargin).toBeCloseTo(0.9);
    expect(p.monthProgress).toBe(0.5);
  });
  it("margins are null without revenue", () => {
    const p = monthProfit({
      earned: 0,
      earnedRecorded: 0,
      upcoming: 0,
      noShowRate: null,
      serviceCostsActual: 0,
      serviceCostsUpcoming: 0,
      basePay: 5_000_000,
      commissionEarned: 0,
      commissionUpcoming: 0,
      adjustments: 0,
      otherCosts: 0,
      elapsedDays: 0,
      daysInMonth: 30,
    });
    expect(p.netProfit).toBe(-5_000_000);
    expect(p.netMargin).toBeNull();
  });
  it("uses the salon's no-show rate only with enough history", () => {
    expect(noShowAssumption(2, 10)).toBeNull();
    expect(noShowAssumption(3, 30)).toBe(0.1);
  });
});
