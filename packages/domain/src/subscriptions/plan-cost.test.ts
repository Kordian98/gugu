import { describe, expect, it } from "vitest";
import { planCost, yearlySavingVnd } from "./plan-cost";

describe("planCost (X25, X27)", () => {
  it("Basic is free for the first year, then 99,000 a month or 990,000 a year", () => {
    expect(planCost("basic", "month")).toMatchObject({
      firstYearVnd: 0,
      firstYearPerMonthVnd: 0,
      laterPeriodVnd: 99_000,
      laterPerMonthVnd: 99_000,
      yearlySavingVnd: 0,
    });
    expect(planCost("basic", "year")).toMatchObject({
      firstYearVnd: 0,
      laterPeriodVnd: 990_000,
      laterPerMonthVnd: 82_500,
    });
    expect(yearlySavingVnd("basic")).toBe(198_000);
  });

  it("Pro monthly = 12 × 299,000; yearly = 10 × 299,000 and saves 2 months", () => {
    expect(planCost("pro", "month")).toMatchObject({
      firstYearVnd: 3_588_000,
      laterPeriodVnd: 299_000,
      yearlySavingVnd: 0,
    });
    expect(planCost("pro", "year")).toMatchObject({
      firstYearVnd: 2_990_000,
      firstYearPerMonthVnd: 249_167,
      laterPeriodVnd: 2_990_000,
      yearlySavingVnd: 598_000,
    });
  });

  it("Ultra yearly = 6,990,000 and saves 1,398,000", () => {
    expect(planCost("ultra", "year")).toMatchObject({
      firstYearVnd: 6_990_000,
      yearlySavingVnd: 1_398_000,
    });
    expect(planCost("ultra", "month").firstYearVnd).toBe(8_388_000);
  });
});
