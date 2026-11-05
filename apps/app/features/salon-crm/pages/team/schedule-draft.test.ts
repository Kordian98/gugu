import { describe, expect, it } from "vitest";
import { scheduleDayInput, scheduleDraftDay } from "./schedule-draft";

describe("schedule editor preserves API-supported split days", () => {
  const split = {
    weekday: 1,
    intervals: [
      { start: "08:00", end: "12:00" },
      { start: "14:00", end: "20:00" },
    ],
    breaks: [
      { start: "10:00", end: "10:15" },
      { start: "16:00", end: "16:30" },
    ],
  };
  it("round-trips split shifts and all breaks when saving unrelated edits", () => {
    expect(scheduleDayInput(scheduleDraftDay(1, split))).toEqual(split);
  });
  it("preserves multiple breaks even within one shift", () => {
    const day = { ...split, intervals: [{ start: "08:00", end: "20:00" }] };
    expect(scheduleDayInput(scheduleDraftDay(1, day))).toEqual(day);
  });
  it("replaces only after explicit conversion and supports closing a day", () => {
    const draft = scheduleDraftDay(1, split);
    expect(scheduleDayInput({ ...draft, preserved: null }).intervals).toEqual([
      { start: "08:00", end: "20:00" },
    ]);
    expect(scheduleDayInput({ ...draft, on: false })).toEqual({
      weekday: 1,
      intervals: [],
      breaks: [],
    });
    expect(scheduleDayInput({ ...draft, weekday: 2 })).toEqual({ ...split, weekday: 2 });
  });
});
