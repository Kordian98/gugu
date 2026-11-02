import { describe, expect, it } from "vitest";

import { monthCells } from "./month-grid";

describe("monthCells", () => {
  it("starts weeks on Monday and pads to full weeks", () => {
    const nov = monthCells(2026, 10); // November 2026 starts on a Sunday
    expect(nov.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(nov.length % 7).toBe(0);
    expect(nov.filter(Boolean)).toHaveLength(30);
  });
  it("handles leap years", () => {
    expect(monthCells(2028, 1).filter(Boolean).at(-1)).toBe("2028-02-29");
  });
});
