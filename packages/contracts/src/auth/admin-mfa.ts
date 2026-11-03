import { z } from "zod";
import { adminReasonSchema } from "../admin/admin";
import { uuidV7Schema } from "../common/ids";

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
  /** q93: an admin cannot reset their own second factor through the team reset. */
  resetSelfForbidden: "admin.mfa_reset_self_forbidden",
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

// ─── Admin team: second super_admin resets another admin's 2FA (owner answer q93) ──────────────

/**
 * One GuGu admin as seen by a super_admin on the security screen (`GET /admin/team`, permission
 * `platform.mfa.reset`). Work email only; no secrets, no recovery codes.
 */
export const adminTeamMemberSchema = z.object({
  userId: uuidV7Schema,
  email: z.string().nullable(),
  platformRole: z.enum(["support_admin", "super_admin"]),
  isSelf: z.boolean(),
  mfaEnrolled: z.boolean(),
  mfaEnrolledAt: z.iso.datetime().nullable(),
  recoveryCodesRemaining: z.number().int().min(0),
  activeSessions: z.number().int().min(0),
});
export type AdminTeamMember = z.infer<typeof adminTeamMemberSchema>;

export const adminTeamListSchema = z.object({ items: z.array(adminTeamMemberSchema) });
export type AdminTeamList = z.infer<typeof adminTeamListSchema>;

export const adminTeamParamsSchema = z.object({ userId: uuidV7Schema });

/**
 * `POST /admin/team/:userId/mfa/reset`: needs the acting super_admin's own step-up and a reason
 * (5–500 chars). Revokes the target's factor, recovery codes, elevations and every session; the
 * target signs in again and re-enrols before any admin write. Never one's own account.
 */
export const adminMfaResetInputSchema = z.object({ reason: adminReasonSchema });
export type AdminMfaResetInput = z.infer<typeof adminMfaResetInputSchema>;
