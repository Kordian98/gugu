import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  type BookingStatus,
  evaluateTransition,
  isTerminal,
  nextStatuses,
  type TransitionActor,
  type TransitionContext,
} from "./state-machine";

const M = 60_000;
const START = Date.UTC(2026, 10, 3, 3); // 10:00 HCM
const END = START + 30 * M;

const ctx = (
  from: BookingStatus,
  to: BookingStatus,
  patch: Partial<TransitionContext> = {},
): TransitionContext => ({
  from,
  to,
  actor: "salon",
  now: START - 24 * 60 * M,
  startsAt: START,
  endsAt: END,
  cancelCutoffMinutes: 120,
  ...patch,
});

describe("evaluateTransition", () => {
  it.each<[BookingStatus, BookingStatus, TransitionActor, number, string]>([
    ["pending", "confirmed", "salon", -60, "ok"],
    ["pending", "confirmed", "customer", -60, "invalid_transition"],
    ["pending", "confirmed", "salon", 40, "too_late"],
    ["pending", "cancelled_by_salon", "system", -60, "ok"],
    ["pending", "cancelled_by_customer", "customer", -180, "ok"],
    ["confirmed", "checked_in", "salon", -61, "too_early"],
    ["confirmed", "checked_in", "salon", -60, "ok"],
    ["confirmed", "completed", "salon", -1, "too_early"],
    ["confirmed", "completed", "salon", 0, "ok"],
    ["confirmed", "no_show", "salon", 14, "too_early"],
    ["confirmed", "no_show", "salon", 15, "ok"],
    ["confirmed", "cancelled_by_salon", "salon", 29, "ok"],
    ["confirmed", "cancelled_by_salon", "salon", 30, "too_late"],
    ["confirmed", "cancelled_by_salon", "system", -60, "invalid_transition"],
    ["confirmed", "cancelled_by_customer", "customer", -121, "ok"],
    ["confirmed", "cancelled_by_customer", "customer", -119, "cancel_window_passed"],
    ["confirmed", "cancelled_by_customer", "salon", -10, "ok"],
    ["confirmed", "cancelled_by_customer", "salon", 0, "too_late"],
    ["checked_in", "completed", "salon", 10, "ok"],
    ["cancelled_by_salon", "confirmed", "salon", -60, "invalid_transition"],
    ["completed", "pending", "salon", 60, "invalid_transition"],
  ])("%s → %s by %s at start%+d min: %s", (from, to, actor, offset, expected) => {
    const r = evaluateTransition(ctx(from, to, { actor, now: START + offset * M }));
    expect(r.ok ? "ok" : r.code).toBe(expected);
  });

  it("late cancellation is flagged inside the cutoff (q14)", () => {
    const late = evaluateTransition(
      ctx("confirmed", "cancelled_by_customer", { now: START - 60 * M }),
    );
    expect(late).toEqual({ ok: true, lateCancellation: true, keepsOccupancy: false });
    const early = evaluateTransition(
      ctx("confirmed", "cancelled_by_customer", { actor: "customer" }),
    );
    expect(early).toEqual({ ok: true, lateCancellation: false, keepsOccupancy: false });
  });

  it("checked_in → cancelled_by_salon needs a reason", () => {
    expect(evaluateTransition(ctx("checked_in", "cancelled_by_salon"))).toEqual({
      ok: false,
      code: "reason_required",
    });
    expect(
      evaluateTransition(ctx("checked_in", "cancelled_by_salon", { reason: "power cut" })).ok,
    ).toBe(true);
  });

  it("no_show ↔ completed corrections: owner/manager, reason, within 48 h", () => {
    const base = { now: END + 60 * M, reason: "mis-click", canCorrect: true };
    expect(evaluateTransition(ctx("no_show", "completed", base))).toEqual({
      ok: true,
      lateCancellation: false,
      keepsOccupancy: false,
    });
    expect(evaluateTransition(ctx("completed", "no_show", base)).ok).toBe(true);
    expect(evaluateTransition(ctx("completed", "no_show", { ...base, canCorrect: false }))).toEqual(
      {
        ok: false,
        code: "invalid_transition",
      },
    );
    expect(evaluateTransition(ctx("completed", "no_show", { ...base, reason: " " }))).toEqual({
      ok: false,
      code: "reason_required",
    });
    expect(
      evaluateTransition(ctx("completed", "no_show", { ...base, now: END + 49 * 3_600_000 })),
    ).toEqual({
      ok: false,
      code: "too_late",
    });
  });

  it("confirm keeps occupancy, no-show releases it", () => {
    expect(evaluateTransition(ctx("pending", "confirmed"))).toMatchObject({ keepsOccupancy: true });
    expect(evaluateTransition(ctx("confirmed", "no_show", { now: END }))).toMatchObject({
      keepsOccupancy: false,
    });
  });
});

describe("nextStatuses / isTerminal", () => {
  it("lists targets per actor", () => {
    expect(nextStatuses("confirmed", "customer")).toEqual(["cancelled_by_customer"]);
    expect(nextStatuses("pending", "system")).toEqual(["cancelled_by_salon"]);
    expect(nextStatuses("cancelled_by_customer", "salon")).toEqual([]);
  });
  it("terminal statuses", () => {
    expect(BOOKING_STATUSES.filter(isTerminal)).toEqual([
      "cancelled_by_customer",
      "cancelled_by_salon",
    ]);
  });
});
