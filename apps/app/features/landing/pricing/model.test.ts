import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANSWERS,
  QUESTION_KEYS,
  TEAM_DEFAULTS,
  advise,
  estimate,
  frontDeskMinutes,
  ownerMinutes,
  profileDefaults,
  recommend,
} from "./model";

const basicProfile = profileDefaults(DEFAULT_ANSWERS);

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
    expect(estimate({ weekly, price })).toEqual({
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
    expect(estimate({ weekly: 25, price: 250_000, staff: 0 }).ownerHours).toBe(1);
    expect(estimate({ weekly: 70, price: 300_000, staff: 4 }).ownerHours).toBe(6);
    expect(estimate({ weekly: 160, price: 350_000, staff: 8 }).ownerHours).toBe(12);
    // Owner hours never change the đ figure.
    expect(estimate({ weekly: 70, price: 300_000, staff: 8 }).keptVnd).toBe(
      estimate({ weekly: 70, price: 300_000 }).keptVnd,
    );
  });

  it("'AI = Có' profile: +35 % default bookings and 3/4/5 h of assistant time", () => {
    expect(basicProfile).toMatchObject({ weekly: 70, assistantMinutes: 0, locations: 1 });
    const pro = profileDefaults({ team: "small", ai: true, multi: false });
    expect(pro).toEqual({
      locations: 1,
      weekly: 95,
      price: 300_000,
      staff: 4,
      assistantMinutes: 240,
      uplift: true,
    });
    expect(profileDefaults({ team: "solo", ai: true, multi: false }).assistantMinutes).toBe(180);
    expect(profileDefaults({ team: "large", ai: true, multi: false }).assistantMinutes).toBe(300);
    const a = advise("pro", "month", pro);
    expect(a.estimate.bookingsPerMonth).toBe(411);
    expect(a.estimate.ownerHours).toBe(Math.round((380 + 240) / 60)); // 10 h
    expect(a.estimate.keptVnd).toBe(3_083_000); // 411 × 10 % × 25 % × 300,000
    expect(a.netFirstYearPerMonthVnd).toBe(3_083_000 - 299_000);
    // Same inputs on Basic (no assistant): same volume and revenue kept, no assistant time.
    const b = advise("basic", "month", pro);
    expect(b.estimate.keptVnd).toBe(a.estimate.keptVnd);
    expect(b.estimate.ownerHours).toBe(6);
  });

  it("net value = revenue kept − plan cost per month", () => {
    const basic = advise("basic", "month", basicProfile);
    expect(basic.netFirstYearPerMonthVnd).toBe(2_273_000);
    expect(basic.netLaterPerMonthVnd).toBe(2_273_000 - 99_000);
    const pro = advise("pro", "year", basicProfile);
    expect(pro.cost.firstYearVnd).toBe(2_990_000);
    expect(pro.netFirstYearPerMonthVnd).toBe(2_273_000 - 249_167);
  });

  it("several locations: volume and staff × locations (default 2), Ultra's own fee", () => {
    const multi = profileDefaults({ team: "small", ai: false, multi: true });
    expect(multi).toMatchObject({ locations: 2, weekly: 140, staff: 8 });
    expect(profileDefaults({ team: "small", ai: false, multi: true }, 3)).toMatchObject({
      locations: 3,
      weekly: 210,
      staff: 12,
    });
    const u = advise("ultra", "month", multi);
    expect(u.cost.laterPeriodVnd).toBe(699_000);
    expect(u.cost.firstYearVnd).toBe(12 * 699_000);
    // 140/week → 606/month → 15.2 kept × 300,000 = 4,545,000 − 699,000.
    expect(u.estimate.keptVnd).toBe(4_545_000);
    expect(u.netFirstYearPerMonthVnd).toBe(4_545_000 - 699_000);
    expect(advise("ultra", "year", multi).cost.firstYearVnd).toBe(6_990_000);
  });

  it("Ultra multi-location hours: merged reports 2 h/location, branch calls 1 h/location/week", () => {
    const multi = profileDefaults({ team: "small", ai: false, multi: true });
    const u = advise("ultra", "month", multi);
    // Owner: 8 staff × 80 + 60 + 2 × 120 = 940 min ≈ 16 h. Front desk: 606 × 3 + 2 × 60 × 4.33.
    expect(ownerMinutes(8, 0, 2)).toBe(940);
    expect(u.estimate.ownerHours).toBe(16);
    expect(frontDeskMinutes(606, 2)).toBeCloseTo(606 * 3 + 2 * 60 * 4.33);
    expect(u.estimate.hours).toBe(39);
    // The same inputs on Pro: no multi-location savings (Pro has one location), assistant only.
    const p = advise("pro", "month", multi);
    expect(p.countedLocations).toBe(1);
    expect(p.estimate.ownerHours).toBe(Math.round((8 * 80 + 60) / 60));
    expect(p.estimate.keptVnd).toBe(u.estimate.keptVnd);
  });
});
