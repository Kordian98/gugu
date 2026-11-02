/** Stable problem+json codes of the booking engine (clients translate `errors.<code>`). */
export const BOOKING_ERRORS = {
  slotTaken: "booking.slot_taken",
  invalidTransition: "booking.invalid_transition",
  tooEarly: "booking.too_early",
  tooLate: "booking.too_late",
  cancelWindowPassed: "booking.cancel_window_passed",
  rescheduleWindowPassed: "booking.reschedule_window_passed",
  reasonRequired: "booking.reason_required",
  holdNotFound: "booking.hold_not_found",
  idempotencyKeyRequired: "booking.idempotency_key_required",
  idempotencyMismatch: "booking.idempotency_mismatch",
  activeLimitReached: "booking.active_limit_reached",
  invalidActorSource: "booking.invalid_actor_source",
  staffSelectionDisabled: "booking.staff_selection_disabled",
  serviceUnavailable: "booking.service_unavailable",
  phoneInvalid: "booking.phone_invalid",
  customerRequired: "booking.customer_required",
  overrideNotAllowed: "booking.override_not_allowed",
  /** Outside hours / lead time / window: retry with `overrides` (listed in `errors`) + a reason. */
  overrideRequired: "booking.override_required",
  notFound: "booking.not_found",
} as const;
export type BookingErrorCode = (typeof BOOKING_ERRORS)[keyof typeof BOOKING_ERRORS];
