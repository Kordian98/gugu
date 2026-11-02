import { describe, expect, it } from "vitest";
import { decideCs, FREE_WINDOW_MS, PAID_WINDOW_MS, sendWindow } from "./window";

const now = new Date("2026-12-10T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("sendWindow (48 h free / 7 d paid / closed)", () => {
  it.each([
    [null, "closed"],
    [ago(0), "free"],
    [ago(-60_000), "free"],
    [ago(FREE_WINDOW_MS), "free"],
    [ago(FREE_WINDOW_MS + 1), "paid"],
    [ago(PAID_WINDOW_MS), "paid"],
    [ago(PAID_WINDOW_MS + 1), "closed"],
  ] as const)("last interaction %s → %s", (last, expected) => {
    expect(sendWindow(last, now)).toBe(expected);
  });
});

describe("decideCs", () => {
  it("sends free inside 48 h, paid inside 7 d when allowed, never after 7 d", () => {
    expect(decideCs(ago(1_000), now, false)).toEqual({ send: true, tier: "free" });
    expect(decideCs(ago(FREE_WINDOW_MS + 1), now, true)).toEqual({ send: true, tier: "paid" });
    expect(decideCs(ago(FREE_WINDOW_MS + 1), now, false)).toEqual({
      send: false,
      reason: "paid_messages_off",
    });
    expect(decideCs(ago(PAID_WINDOW_MS + 1), now, true)).toEqual({
      send: false,
      reason: "window_closed",
    });
    expect(decideCs(null, now, true)).toEqual({ send: false, reason: "window_closed" });
  });
});
