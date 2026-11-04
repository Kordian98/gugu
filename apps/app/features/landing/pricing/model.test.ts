import { describe, expect, it } from "vitest";
import { DEFAULT_ANSWERS, TEAM_DEFAULTS, advise, estimate, recommend } from "./model";

describe("pricing assistant model", () => {
  it("recommends Basic by default, Pro for the AI assistant, Ultra for several locations", () => {
    expect(recommend(DEFAULT_ANSWERS)).toBe("basic");
    expect(recommend({ ...DEFAULT_ANSWERS, ai: true })).toBe("pro");
    expect(recommend({ ...DEFAULT_ANSWERS, multi: true })).toBe("ultra");
    expect(recommend({ team: "solo", ai: true, multi: true })).toBe("ultra");
  });

  it("estimates hours and revenue kept from plain assumptions", () => {
    // 70/week → 303/month; 303 × 3 min = 15 h; 303 × 10 % × 25 % = 7.6 no-shows × 300,000.
    const { weekly, price } = TEAM_DEFAULTS.small;
    expect(estimate(weekly, price)).toEqual({
      bookingsPerMonth: 303,
      hours: 15,
      noShowsAvoided: 7.6,
      keptVnd: 2_273_000,
    });
  });

  it("net value = revenue kept − plan cost per month", () => {
    const basic = advise("basic", "month", 70, 300_000);
    expect(basic.netFirstYearPerMonthVnd).toBe(2_273_000);
    expect(basic.netLaterPerMonthVnd).toBe(2_273_000 - 99_000);
    const pro = advise("pro", "year", 70, 300_000);
    expect(pro.cost.firstYearVnd).toBe(2_990_000);
    expect(pro.netFirstYearPerMonthVnd).toBe(2_273_000 - 249_167);
  });
});
