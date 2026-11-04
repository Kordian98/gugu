import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANSWERS,
  QUESTION_KEYS,
  TEAM_DEFAULTS,
  advise,
  estimate,
  ownerMinutes,
  profileDefaults,
  recommend,
} from "./model";

describe("pricing assistant model", () => {
  it("every step starts answered: the defaults preselect all three questions", () => {
    // The steps show a check from the start (no "0 of 3" counter that contradicts the screen).
    for (const k of QUESTION_KEYS) expect(DEFAULT_ANSWERS[k]).not.toBeUndefined();
    expect(QUESTION_KEYS).toHaveLength(3);
  });

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
      ownerHours: 1,
      noShowsAvoided: 7.6,
      keptVnd: 2_273_000,
    });
  });

  it("owner hours: staff × (1 h commissions + 20 min payroll) + 1 h profit tally; solo = tally", () => {
    expect(ownerMinutes(0)).toBe(60);
    expect(ownerMinutes(4)).toBe(4 * 80 + 60); // 380 min ≈ 6 h
    expect(estimate(25, 250_000, TEAM_DEFAULTS.solo.staff).ownerHours).toBe(1);
    expect(estimate(70, 300_000, TEAM_DEFAULTS.small.staff).ownerHours).toBe(6);
    expect(estimate(160, 350_000, TEAM_DEFAULTS.large.staff).ownerHours).toBe(12);
    // Owner hours never change the đ figure.
    expect(estimate(70, 300_000, 8).keptVnd).toBe(estimate(70, 300_000, 0).keptVnd);
  });

  it("'AI = Có' profile: +35 % default bookings and 3/4/5 h of assistant time (Pro only)", () => {
    expect(profileDefaults({ team: "small", ai: false, multi: false })).toMatchObject({
      weekly: 70,
      assistantMinutes: 0,
    });
    const pro = profileDefaults({ team: "small", ai: true, multi: false });
    expect(pro).toEqual({
      weekly: 95,
      price: 300_000,
      staff: 4,
      assistantMinutes: 240,
      uplift: true,
    });
    expect(profileDefaults({ team: "solo", ai: true, multi: false }).assistantMinutes).toBe(180);
    expect(profileDefaults({ team: "large", ai: true, multi: false }).assistantMinutes).toBe(300);
    const a = advise("pro", "month", pro.weekly, pro.price, pro.staff, pro.assistantMinutes);
    expect(a.estimate.bookingsPerMonth).toBe(411);
    expect(a.estimate.ownerHours).toBe(Math.round((380 + 240) / 60)); // 10 h
    expect(a.estimate.keptVnd).toBe(3_083_000); // 411 × 10 % × 25 % × 300,000
    expect(a.netFirstYearPerMonthVnd).toBe(3_083_000 - 299_000);
    // Same inputs on Basic (no assistant): same volume and revenue kept, no assistant time.
    const b = advise("basic", "month", pro.weekly, pro.price, pro.staff, pro.assistantMinutes);
    expect(b.estimate.keptVnd).toBe(a.estimate.keptVnd);
    expect(b.estimate.ownerHours).toBe(6);
  });

  it("net value = revenue kept − plan cost per month", () => {
    const basic = advise("basic", "month", 70, 300_000);
    expect(basic.netFirstYearPerMonthVnd).toBe(2_273_000);
    expect(basic.netLaterPerMonthVnd).toBe(2_273_000 - 99_000);
    const pro = advise("pro", "year", 70, 300_000);
    expect(pro.cost.firstYearVnd).toBe(2_990_000);
    expect(pro.netFirstYearPerMonthVnd).toBe(2_273_000 - 249_167);
  });

  it("Ultra starts on Pro and is costed as Pro until multi-location ships (q106)", () => {
    const ultra = advise("ultra", "month", 70, 300_000);
    expect(ultra.plan).toBe("ultra");
    expect(ultra.billed).toBe("pro");
    expect(ultra.cost.laterPeriodVnd).toBe(299_000);
    expect(ultra.netFirstYearPerMonthVnd).toBe(2_273_000 - 299_000);
  });
});
