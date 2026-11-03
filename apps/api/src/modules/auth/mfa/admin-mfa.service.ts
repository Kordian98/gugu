import { Injectable } from "@nestjs/common";
import {
  ADMIN_ENROL_FRESH_SIGN_IN_MINUTES,
  ADMIN_ERRORS,
  ADMIN_MFA_ERRORS,
  ADMIN_RECOVERY_CODE_COUNT,
  ADMIN_STEP_UP_MINUTES,
  type AdminMfaEnrolment,
  type AdminMfaRecoveryCodes,
  type AdminMfaStatus,
  type AdminStepUpInput,
  type AdminStepUpResult,
} from "@gugu/contracts";
import { SealedBox } from "../../../common/crypto/sealed-box";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { AppConfig } from "../../../infrastructure/config/app-config";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import {
  type RateLimitRule,
  RateLimitService,
} from "../../../infrastructure/rate-limit/rate-limit.service";
import { type AuditAction, AuditService } from "../../audit/audit.facade";
import type { RequestMeta } from "../infra/http-meta";
import { tokenHash } from "../infra/tokens";
import {
  generateRecoveryCode,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "./totp";

const MINUTE = 60_000;
const PENDING_TTL_MS = 15 * MINUTE;

/** Wrong codes per admin per 15 minutes before every MFA check answers 429 (spec 05 R32). */
export const MFA_FAILURE_RULE: RateLimitRule = {
  name: "admin.mfa.failures",
  limit: 5,
  windowSeconds: 15 * 60,
};

type Db = Prisma.TransactionClient;

/**
 * Platform-admin second factor (topic 05 step 9, ADR-0011). Replaces the "signed in within 15
 * minutes" stand-in of ADR-0010: high-risk admin writes need a step-up — a TOTP or recovery code
 * verified on the current session within ADMIN_STEP_UP_MINUTES — and every admin write needs an
 * enrolled factor. Secrets are sealed at rest; recovery codes are stored as HMACs only; codes are
 * single-use (TOTP: the accepted step must be newer than the last one) and failures rate-limited.
 */
@Injectable()
export class AdminMfaService {
  private readonly box: SealedBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly limits: RateLimitService,
  ) {
    this.box = new SealedBox(config.env.MFA_ENCRYPTION_KEY);
  }

  async status(admin: UserPrincipal): Promise<AdminMfaStatus> {
    const [factor, remaining, session] = await Promise.all([
      this.prisma.adminMfaFactor.findUnique({ where: { userId: admin.userId } }),
      this.prisma.adminRecoveryCode.count({ where: { userId: admin.userId, usedAt: null } }),
      this.prisma.session.findUnique({
        where: { id: admin.sessionId },
        select: { stepUpUntil: true },
      }),
    ]);
    const now = Date.now();
    const pending =
      !!factor?.pendingCreatedAt && now - factor.pendingCreatedAt.getTime() < PENDING_TTL_MS;
    const until = session?.stepUpUntil;
    return {
      enrolled: !!factor?.confirmedAt,
      enrolledAt: factor?.confirmedAt?.toISOString() ?? null,
      pending,
      recoveryCodesRemaining: factor?.confirmedAt ? remaining : 0,
      stepUpUntil: until && until.getTime() > now ? until.toISOString() : null,
    };
  }

  /**
   * Starts (or restarts) an enrolment. The first enrolment needs a sign-in within
   * ADMIN_ENROL_FRESH_SIGN_IN_MINUTES, so a stolen old session cannot attach its own factor;
   * replacing an existing factor needs a step-up with the current one (or a recovery code).
   */
  async startEnrolment(admin: UserPrincipal): Promise<AdminMfaEnrolment> {
    const factor = await this.prisma.adminMfaFactor.findUnique({
      where: { userId: admin.userId },
      select: { confirmedAt: true },
    });
    if (factor?.confirmedAt) {
      await this.assertSteppedUp(admin);
    } else {
      await this.assertFreshSignIn(admin);
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: admin.userId },
      select: { email: true },
    });
    const secret = generateTotpSecret();
    const sealed = this.box.seal(secret, admin.userId);
    const now = new Date();
    await this.prisma.adminMfaFactor.upsert({
      where: { userId: admin.userId },
      create: { userId: admin.userId, pendingSecretCiphertext: sealed, pendingCreatedAt: now },
      update: { pendingSecretCiphertext: sealed, pendingCreatedAt: now },
    });
    return { secret, otpauthUri: otpauthUri(secret, user.email ?? admin.userId) };
  }

  /** Confirms the pending enrolment with its first code; issues fresh recovery codes. */
  async confirmEnrolment(
    admin: UserPrincipal,
    code: string,
    meta: RequestMeta,
  ): Promise<AdminMfaRecoveryCodes> {
    await this.assertNotLocked(admin);
    const factor = await this.prisma.adminMfaFactor.findUnique({
      where: { userId: admin.userId },
    });
    const now = Date.now();
    if (
      !factor?.pendingSecretCiphertext ||
      !factor.pendingCreatedAt ||
      now - factor.pendingCreatedAt.getTime() >= PENDING_TTL_MS
    ) {
      throw new AppError(409, ADMIN_MFA_ERRORS.enrollmentNotStarted, "Start the enrolment first");
    }
    const secret = this.box.open(factor.pendingSecretCiphertext, admin.userId);
    const step = verifyTotp(secret, code, now);
    if (step === null) return this.fail(admin, meta, "enrolment");
    const wasEnrolled = factor.confirmedAt !== null;
    const codes = Array.from({ length: ADMIN_RECOVERY_CODE_COUNT }, generateRecoveryCode);
    const stepUpUntil = new Date(now + ADMIN_STEP_UP_MINUTES * MINUTE);
    await this.prisma.$transaction(async (tx) => {
      // Conditional on the same pending secret: a parallel restart makes this one lose.
      const { count } = await tx.adminMfaFactor.updateMany({
        where: { id: factor.id, pendingSecretCiphertext: factor.pendingSecretCiphertext },
        data: {
          secretCiphertext: factor.pendingSecretCiphertext,
          confirmedAt: new Date(now),
          lastUsedStep: BigInt(step),
          pendingSecretCiphertext: null,
          pendingCreatedAt: null,
        },
      });
      if (count !== 1) {
        throw new AppError(409, ADMIN_MFA_ERRORS.enrollmentNotStarted, "Enrolment changed");
      }
      await this.replaceRecoveryCodes(tx, admin.userId, codes);
      await this.elevate(tx, admin.sessionId, stepUpUntil);
      await this.record(tx, wasEnrolled ? "admin.mfa_reset" : "admin.mfa_enrolled", admin, meta, {
        recoveryCodes: codes.length,
      });
    });
    return { recoveryCodes: codes, stepUpUntil: stepUpUntil.toISOString() };
  }

  /** Verifies a TOTP or recovery code and elevates the current session for ADMIN_STEP_UP_MINUTES. */
  async stepUp(
    admin: UserPrincipal,
    input: AdminStepUpInput,
    meta: RequestMeta,
  ): Promise<AdminStepUpResult> {
    await this.assertNotLocked(admin);
    const factor = await this.confirmedFactor(admin);
    const now = Date.now();
    const stepUpUntil = new Date(now + ADMIN_STEP_UP_MINUTES * MINUTE);
    const method = "code" in input ? "totp" : "recovery_code";
    const ok = await this.prisma.$transaction(async (tx) => {
      const accepted =
        "code" in input
          ? await this.consumeTotp(tx, factor, input.code, now)
          : await this.consumeRecoveryCode(tx, admin.userId, input.recoveryCode, now);
      if (!accepted) return false;
      await this.elevate(tx, admin.sessionId, stepUpUntil);
      await this.record(tx, "admin.mfa_step_up", admin, meta, { method });
      return true;
    });
    if (!ok) return this.fail(admin, meta, method);
    const remaining = await this.prisma.adminRecoveryCode.count({
      where: { userId: admin.userId, usedAt: null },
    });
    return { stepUpUntil: stepUpUntil.toISOString(), recoveryCodesRemaining: remaining };
  }

  /** New recovery codes (the old ones stop working). Needs a current TOTP code. */
  async regenerateRecoveryCodes(
    admin: UserPrincipal,
    code: string,
    meta: RequestMeta,
  ): Promise<AdminMfaRecoveryCodes> {
    await this.assertNotLocked(admin);
    const factor = await this.confirmedFactor(admin);
    const now = Date.now();
    const codes = Array.from({ length: ADMIN_RECOVERY_CODE_COUNT }, generateRecoveryCode);
    const stepUpUntil = new Date(now + ADMIN_STEP_UP_MINUTES * MINUTE);
    const ok = await this.prisma.$transaction(async (tx) => {
      if (!(await this.consumeTotp(tx, factor, code, now))) return false;
      await this.replaceRecoveryCodes(tx, admin.userId, codes);
      await this.elevate(tx, admin.sessionId, stepUpUntil);
      await this.record(tx, "admin.mfa_recovery_codes_regenerated", admin, meta, {
        recoveryCodes: codes.length,
      });
      return true;
    });
    if (!ok) return this.fail(admin, meta, "totp");
    return { recoveryCodes: codes, stepUpUntil: stepUpUntil.toISOString() };
  }

  /**
   * Gate for every admin write (AdminActions.run): an enrolled factor, and for high-risk actions
   * an active step-up on this session.
   */
  async assertWriteAllowed(admin: UserPrincipal, opts: { stepUp: boolean }): Promise<void> {
    const factor = await this.prisma.adminMfaFactor.findUnique({
      where: { userId: admin.userId },
      select: { confirmedAt: true },
    });
    if (!factor?.confirmedAt) {
      throw new AppError(403, ADMIN_MFA_ERRORS.enrollmentRequired, "Enrol a second factor first");
    }
    if (opts.stepUp) await this.assertSteppedUp(admin);
  }

  private async assertSteppedUp(admin: UserPrincipal): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: admin.sessionId },
      select: { stepUpUntil: true, revokedAt: true },
    });
    if (!session || session.revokedAt || !session.stepUpUntil || session.stepUpUntil <= new Date()) {
      throw new AppError(403, ADMIN_ERRORS.stepUpRequired, "Confirm with your authenticator code");
    }
  }

  private async assertFreshSignIn(admin: UserPrincipal): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: admin.sessionId },
      select: { createdAt: true },
    });
    const age = session ? Date.now() - session.createdAt.getTime() : Infinity;
    if (age > ADMIN_ENROL_FRESH_SIGN_IN_MINUTES * MINUTE) {
      throw new AppError(403, ADMIN_MFA_ERRORS.freshSignInRequired, "Sign in again to enrol");
    }
  }

  private async confirmedFactor(admin: UserPrincipal) {
    const factor = await this.prisma.adminMfaFactor.findUnique({
      where: { userId: admin.userId },
    });
    if (!factor?.confirmedAt || !factor.secretCiphertext) {
      throw new AppError(403, ADMIN_MFA_ERRORS.enrollmentRequired, "Enrol a second factor first");
    }
    return { id: factor.id, userId: factor.userId, secretCiphertext: factor.secretCiphertext };
  }

  /** Accepts a code only if its step is newer than the last accepted one (no replay). */
  private async consumeTotp(
    tx: Db,
    factor: { id: string; userId: string; secretCiphertext: string },
    code: string,
    now: number,
  ): Promise<boolean> {
    const step = verifyTotp(this.box.open(factor.secretCiphertext, factor.userId), code, now);
    if (step === null) return false;
    const { count } = await tx.adminMfaFactor.updateMany({
      where: {
        id: factor.id,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
      },
      data: { lastUsedStep: BigInt(step) },
    });
    return count === 1;
  }

  private async consumeRecoveryCode(
    tx: Db,
    userId: string,
    code: string,
    now: number,
  ): Promise<boolean> {
    const { count } = await tx.adminRecoveryCode.updateMany({
      where: { userId, codeHash: this.recoveryHash(userId, code), usedAt: null },
      data: { usedAt: new Date(now) },
    });
    return count === 1;
  }

  private async replaceRecoveryCodes(tx: Db, userId: string, codes: string[]): Promise<void> {
    await tx.adminRecoveryCode.deleteMany({ where: { userId } });
    await tx.adminRecoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: this.recoveryHash(userId, c) })),
    });
  }

  private recoveryHash(userId: string, code: string): string {
    return tokenHash(
      this.config.env.AUTH_SECRET,
      "admin_recovery",
      `${userId}\u0000${normalizeRecoveryCode(code)}`,
    );
  }

  private async elevate(tx: Db, sessionId: string, until: Date): Promise<void> {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { stepUpUntil: until },
    });
    if (count !== 1) throw new AppError(401, COMMON_ERRORS.unauthorized, "Session ended");
  }

  private async assertNotLocked(admin: UserPrincipal): Promise<void> {
    if (await this.limits.exceeded(MFA_FAILURE_RULE, admin.userId)) {
      throw new AppError(429, COMMON_ERRORS.rateLimited, "Too many wrong codes", {
        detail: `retry within ${String(MFA_FAILURE_RULE.windowSeconds)}s`,
      });
    }
  }

  /** Counts the failure (429 once over the limit), audits it and answers 400. */
  private async fail(admin: UserPrincipal, meta: RequestMeta, method: string): Promise<never> {
    await this.record(this.prisma, "admin.mfa_step_up_failed", admin, meta, { method });
    await this.limits.consume(MFA_FAILURE_RULE, admin.userId);
    throw new AppError(400, ADMIN_MFA_ERRORS.codeInvalid, "Code invalid");
  }

  private record(
    db: Db | PrismaService,
    action: AuditAction,
    admin: UserPrincipal,
    meta: RequestMeta,
    metadata: Record<string, string | number>,
  ) {
    return this.audit.record(
      {
        action,
        actor: { type: "platform_admin", id: admin.userId },
        targetType: "user",
        targetId: admin.userId,
        ipPrefix: meta.ipPrefix,
        userAgent: meta.userAgent,
        metadata: { ...metadata, platformRole: admin.platformRole },
      },
      db,
    );
  }
}
