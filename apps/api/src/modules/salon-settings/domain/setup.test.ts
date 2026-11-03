import { describe, expect, it } from "vitest";
import { setupRemaining, setupStateOf, withStep, withoutStep } from "./setup";

const facts = {
  businessDone: false,
  openingDays: 0,
  activeServices: 0,
  bookableStaff: 0,
  zaloConnected: false,
};

describe("setup state", () => {
  it("a fresh quick-start salon has everything open, in wizard order", () => {
    expect(setupRemaining(facts)).toEqual(["business", "hours", "services", "team", "zalo"]);
  });

  it("remaining follows real data, not clicks", () => {
    expect(
      setupRemaining({ ...facts, businessDone: true, openingDays: 7, activeServices: 3 }),
    ).toEqual(["team", "zalo"]);
    expect(
      setupRemaining({
        businessDone: true,
        openingDays: 6,
        activeServices: 1,
        bookableStaff: 1,
        zaloConnected: true,
      }),
    ).toEqual([]);
  });

  it("maps the row and ignores unknown stored values", () => {
    const state = setupStateOf(
      {
        businessType: "nails",
        nameConfirmed: true,
        currentStep: "bogus",
        completedSteps: ["business", "old_step"],
        skippedSteps: [],
        wizardClosedAt: null,
        finishedAt: null,
        cardDismissedAt: new Date(),
      },
      facts,
    );
    expect(state).toMatchObject({
      businessType: "nails",
      currentStep: "business",
      completed: ["business"],
      wizardClosed: false,
      cardDismissed: true,
    });
  });

  it("step lists stay unique and ordered", () => {
    expect(withStep(["team", "business"], "hours")).toEqual(["business", "hours", "team"]);
    expect(withStep(["hours"], "hours")).toEqual(["hours"]);
    expect(withoutStep(["hours", "zalo"], "zalo")).toEqual(["hours"]);
  });
});
