import { describe, expect, it } from "vitest";
import { summarizeFunnel } from "./funnel";

describe("summarizeFunnel", () => {
  it("counts reach, drop-off, conversion and lost reasons (skipped steps count as passed)", () => {
    const s = summarizeFunnel([
      { maxRank: 5, booked: true, endReason: null, endStep: null, count: 3 },
      // booked without the staff/phone steps (one staff member, phone known)
      { maxRank: 5, booked: true, endReason: null, endStep: null, count: 1 },
      { maxRank: 1, booked: false, endReason: "abandoned", endStep: "service", count: 2 },
      { maxRank: 3, booked: false, endReason: "no_slots", endStep: "slot", count: 1 },
      { maxRank: 3, booked: false, endReason: "abandoned", endStep: "slot", count: 1 },
      { maxRank: 5, booked: false, endReason: "slot_taken", endStep: "confirm", count: 1 },
      { maxRank: 2, booked: false, endReason: null, endStep: null, count: 1 },
    ]);
    expect(s.sessions).toBe(10);
    expect(s.booked).toBe(4);
    expect(s.inProgress).toBe(1);
    expect(s.conversionRate).toBe(0.4);
    expect(s.steps).toEqual([
      { step: "service", reached: 10, dropOff: 2, dropOffRate: 0.2 },
      { step: "staff", reached: 8, dropOff: 1, dropOffRate: 0.125 },
      { step: "slot", reached: 7, dropOff: 2, dropOffRate: 0.286 },
      { step: "phone", reached: 5, dropOff: 0, dropOffRate: 0 },
      { step: "confirm", reached: 5, dropOff: 1, dropOffRate: 0.2 },
    ]);
    expect(s.lost).toEqual({
      "abandoned:service": 2,
      no_slots: 1,
      "abandoned:slot": 1,
      slot_taken: 1,
    });
  });

  it("is all zeros without sessions", () => {
    const s = summarizeFunnel([]);
    expect(s.conversionRate).toBe(0);
    expect(s.steps.every((x) => x.reached === 0 && x.dropOffRate === 0)).toBe(true);
  });
});
