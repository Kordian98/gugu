import { BOOKING_ERRORS } from "@gugu/contracts";
import type { RescheduleCheck, TransitionResult } from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";

export const slotTaken = () =>
  new AppError(409, BOOKING_ERRORS.slotTaken, "Slot no longer available", {
    detail: "Refresh availability and pick another time.",
  });

/**
 * The time breaks only rules a salon member may override (q18): tell the CRM which ones, so it can
 * ask "book anyway?" and retry with `overrides` + a reason.
 */
export const overrideRequired = (needs: readonly string[]) =>
  new AppError(409, BOOKING_ERRORS.overrideRequired, "Outside the booking rules", {
    detail: `Retry with overrides [${needs.join(", ")}] and a reason.`,
    errors: needs.map((code) => ({ path: "overrides", code })),
  });

/** No slot: rules (overridable) or a real conflict (never overridable). */
export function unbookable(needs: readonly string[] | null, given: readonly string[]): AppError {
  if (needs && needs.length > 0 && needs.some((n) => !given.includes(n))) {
    return overrideRequired(needs);
  }
  return slotTaken();
}

export const bookingNotFound = () =>
  new AppError(404, BOOKING_ERRORS.notFound, "Booking not found");

const TRANSITION_ERRORS: Record<Extract<TransitionResult, { ok: false }>["code"], () => AppError> =
  {
    invalid_transition: () =>
      new AppError(409, BOOKING_ERRORS.invalidTransition, "Status change not allowed"),
    too_early: () => new AppError(409, BOOKING_ERRORS.tooEarly, "Too early for this status change"),
    too_late: () => new AppError(409, BOOKING_ERRORS.tooLate, "Too late for this change"),
    cancel_window_passed: () =>
      new AppError(409, BOOKING_ERRORS.cancelWindowPassed, "Cancellation window has passed", {
        detail: "Please contact the salon to cancel.",
      }),
    reason_required: () =>
      new AppError(422, BOOKING_ERRORS.reasonRequired, "A reason is required", {
        errors: [{ path: "reason", code: BOOKING_ERRORS.reasonRequired }],
      }),
  };

export const transitionError = (code: Extract<TransitionResult, { ok: false }>["code"]) =>
  TRANSITION_ERRORS[code]();

export const rescheduleError = (code: Extract<RescheduleCheck, { ok: false }>["code"]) =>
  code === "reschedule_window_passed"
    ? new AppError(409, BOOKING_ERRORS.rescheduleWindowPassed, "Reschedule window has passed", {
        detail: "Please contact the salon to move this appointment.",
      })
    : code === "too_late"
      ? new AppError(409, BOOKING_ERRORS.tooLate, "Too late to reschedule")
      : new AppError(409, BOOKING_ERRORS.invalidTransition, "This booking can't be moved");
