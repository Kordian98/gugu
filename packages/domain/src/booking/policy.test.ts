import { describe, expect, it } from "vitest";
import { canReschedule, referenceCode } from "./policy";

const M = 60_000;
const START = Date.UTC(2026, 10, 3, 3);
const args = { actor: "customer" as const, startsAt: START, rescheduleCutoffMinutes: 120 };

describe("canReschedule", () => {
  it("customers until the cutoff, salon until the start", () => {
    expect(canReschedule({ ...args, status: "confirmed", now: START - 121 * M })).toEqual({
      ok: true,
    });
    expect(canReschedule({ ...args, status: "pending", now: START - 60 * M })).toEqual({
      ok: false,
      code: "reschedule_window_passed",
    });
    expect(canReschedule({ ...args, actor: "salon", status: "confirmed", now: START - M })).toEqual(
      { ok: true },
    );
    expect(canReschedule({ ...args, actor: "salon", status: "confirmed", now: START })).toEqual({
      ok: false,
      code: "too_late",
    });
    expect(canReschedule({ ...args, status: "checked_in", now: START - 300 * M })).toEqual({
      ok: false,
      code: "invalid_status",
    });
  });
});

describe("referenceCode", () => {
  it("formats six unambiguous characters", () => {
    expect(referenceCode(Uint8Array.from([0, 1, 2, 3, 4, 5]))).toBe("234-567");
    expect(referenceCode(Uint8Array.from([255, 254, 253, 252, 251, 250]))).toMatch(
      /^[2-9A-Z]{3}-[2-9A-Z]{3}$/,
    );
    expect(() => referenceCode(new Uint8Array(3))).toThrow(RangeError);
  });
});
