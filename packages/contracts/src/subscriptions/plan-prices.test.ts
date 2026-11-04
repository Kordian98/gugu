import { describe, expect, it } from "vitest";
import { PLAN_LIST_PRICES_VND, PLAN_MONTHLY_PRICE_VND, planPriceVnd } from "./plan-prices";

describe("plan list prices (X25, X27)", () => {
  it("matches the owner's prices", () => {
    expect(PLAN_MONTHLY_PRICE_VND).toEqual({ basic: 99_000, pro: 299_000, ultra: 699_000 });
  });

  it("yearly = 2 months free (10 × monthly)", () => {
    expect(planPriceVnd("pro", "year")).toBe(2_990_000);
    expect(PLAN_LIST_PRICES_VND).toEqual({
      basic: { month: 99_000, year: 990_000 },
      pro: { month: 299_000, year: 2_990_000 },
      ultra: { month: 699_000, year: 6_990_000 },
    });
  });
});
