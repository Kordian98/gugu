/**
 * Stable error codes returned in problem+json `code` (format from @gugu/contracts problemSchema).
 * The client maps each to an `errors.*` translation key. Domain modules add their own codes
 * (e.g. `booking.slot_taken`); these are the cross-cutting ones.
 * TODO(architecture): move to packages/contracts/src/common/errors.ts so the app can import them.
 */
export const COMMON_ERRORS = {
  validationFailed: "common.validation_failed",
  notFound: "common.not_found",
  methodNotAllowed: "common.method_not_allowed",
  unauthorized: "common.unauthorized",
  forbidden: "common.forbidden",
  conflict: "common.conflict",
  payloadTooLarge: "common.payload_too_large",
  rateLimited: "common.rate_limited",
  badRequest: "common.bad_request",
  serviceUnavailable: "common.service_unavailable",
  internal: "common.internal_error",
} as const;

export const CODE_BY_STATUS: Record<number, string> = {
  400: COMMON_ERRORS.badRequest,
  401: COMMON_ERRORS.unauthorized,
  403: COMMON_ERRORS.forbidden,
  404: COMMON_ERRORS.notFound,
  405: COMMON_ERRORS.methodNotAllowed,
  409: COMMON_ERRORS.conflict,
  413: COMMON_ERRORS.payloadTooLarge,
  422: COMMON_ERRORS.validationFailed,
  429: COMMON_ERRORS.rateLimited,
  503: COMMON_ERRORS.serviceUnavailable,
};
