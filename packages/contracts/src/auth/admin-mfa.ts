import { z } from "zod";

/**
 * Platform-admin second factor (topic 05 step 9, ADR-0011). TOTP (RFC 6238, SHA-1, 30 s, 6 digits)
 * with single-use recovery codes stored hashed. A verified code elevates the current session for
 * ADMIN_STEP_UP_MINUTES; high-risk admin writes need that elevation, every admin write needs an
 * enrolled factor. Routes: `/api/v1/admin/mfa/*` (permission `platform.mfa.self`).
 */

export const ADMIN_MFA_ERRORS = {
  /** No confirmed TOTP factor: enrol in the admin panel before any admin write. */
  enrollmentRequired: "admin.mfa_enrollment_required",
  /** Enrolment (first time) needs a sign-in within ADMIN_ENROL_FRESH_SIGN_IN_MINUTES. */
  freshSignInRequired: "admin.mfa_fresh_sign_in_required",
  /** No enrolment in progress to confirm. */
  enrollmentNotStarted: "admin.mfa_enrollment_not_started",
  /** Wrong, expired or already used TOTP / recovery code. */
  codeInvalid: "admin.mfa_code_invalid",
} as const;

/** Lifetime of a step-up elevation, bound to the session that verified the code. */
export const ADMIN_STEP_UP_MINUTES = 10;

/** First enrolment (no factor yet) is only allowed this soon after a sign-in. */
export const ADMIN_ENROL_FRESH_SIGN_IN_MINUTES = 15;

/** Recovery codes issued per enrolment / regeneration. */
export const ADMIN_RECOVERY_CODE_COUNT = 10;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

/** Recovery codes are shown as `xxxxx-xxxxx` (Crockford base32); spaces/dashes/case are ignored. */
export const recoveryCodeSchema = z
  .string()
  .trim()
  .min(10)
  .max(24)
  .regex(/^[0-9A-Za-z -]+$/);

export const adminMfaStatusSchema = z.object({
  enrolled: z.boolean(),
  enrolledAt: z.iso.datetime().nullable(),
  /** An unconfirmed enrolment exists (QR shown, code not yet entered). */
  pending: z.boolean(),
  recoveryCodesRemaining: z.number().int().min(0),
  /** End of the current session's elevation; null when not elevated. */
  stepUpUntil: z.iso.datetime().nullable(),
});
export type AdminMfaStatus = z.infer<typeof adminMfaStatusSchema>;

export const adminMfaEnrolmentSchema = z.object({
  /** Base32 secret, shown once for manual entry. Never returned again. */
  secret: z.string(),
  /** `otpauth://totp/...` for the QR code. */
  otpauthUri: z.string(),
});
export type AdminMfaEnrolment = z.infer<typeof adminMfaEnrolmentSchema>;

export const adminMfaCodeInputSchema = z.object({ code: totpCodeSchema });
export type AdminMfaCodeInput = z.infer<typeof adminMfaCodeInputSchema>;

export const adminMfaRecoveryCodesSchema = z.object({
  /** Shown once; only hashes are stored. */
  recoveryCodes: z.array(z.string()).length(ADMIN_RECOVERY_CODE_COUNT),
  stepUpUntil: z.iso.datetime(),
});
export type AdminMfaRecoveryCodes = z.infer<typeof adminMfaRecoveryCodesSchema>;

/** Step-up with a TOTP code or, when the device is lost, one recovery code. */
export const adminStepUpInputSchema = z.union([
  z.object({ code: totpCodeSchema }).strict(),
  z.object({ recoveryCode: recoveryCodeSchema }).strict(),
]);
export type AdminStepUpInput = z.infer<typeof adminStepUpInputSchema>;

export const adminStepUpResultSchema = z.object({
  stepUpUntil: z.iso.datetime(),
  recoveryCodesRemaining: z.number().int().min(0),
});
export type AdminStepUpResult = z.infer<typeof adminStepUpResultSchema>;
