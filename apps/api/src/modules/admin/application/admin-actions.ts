import { Injectable } from "@nestjs/common";
import {
  ADMIN_ERRORS,
  ADMIN_STEP_UP_MINUTES,
  type AdminMutationResult,
  adminReasonSchema,
} from "@gugu/contracts";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { type AuditAction, AuditService } from "../../audit/audit.facade";
import type { RequestMeta } from "../../auth/auth.facade";
import {
  type AdminChange,
  Clock,
  EntitlementService,
} from "../../subscriptions/subscriptions.facade";

type Db = Prisma.TransactionClient;

export interface AdminActionParams {
  admin: UserPrincipal;
  action: AuditAction;
  salonId: string;
  reason: string;
  meta: RequestMeta;
  /** High-risk: require a sign-in within ADMIN_STEP_UP_MINUTES (step-up). */
  stepUp?: boolean;
}

/**
 * The only way the admin API changes anything (topic 12 M12.6, gate "every admin action has a
 * reason and an audit row"). In ONE transaction it checks the salon exists, applies the change and
 * writes the audit row (actor, platform role, reason, before, after). If the audit insert fails,
 * the change rolls back. After commit the salon's entitlement cache is invalidated.
 */
@Injectable()
export class AdminActions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
    private readonly clock: Clock,
  ) {}

  async run(
    params: AdminActionParams,
    change: (db: Db, actor: string) => Promise<AdminChange>,
  ): Promise<AdminMutationResult> {
    // Defence in depth: controllers validate the body, but no path may skip the reason.
    const reason = adminReasonSchema.safeParse(params.reason);
    if (!reason.success) {
      throw new AppError(400, COMMON_ERRORS.validationFailed, "Reason required", {
        errors: [{ path: "reason", code: COMMON_ERRORS.validationFailed }],
      });
    }
    if (params.stepUp) await this.assertFreshSignIn(params.admin);
    const actor = `admin:${params.admin.userId}`;
    const auditId = await this.prisma.$transaction(async (tx) => {
      const salon = await tx.salon.findFirst({
        where: { id: params.salonId, deletedAt: null },
        select: { organizationId: true },
      });
      if (!salon) throw new AppError(404, COMMON_ERRORS.notFound, "Salon not found");
      const result = await change(tx, actor);
      return this.audit.record(
        {
          action: params.action,
          actor: { type: "platform_admin", id: params.admin.userId },
          salonId: params.salonId,
          organizationId: salon.organizationId,
          targetType: result.targetType,
          targetId: result.targetId,
          ipPrefix: params.meta.ipPrefix,
          userAgent: params.meta.userAgent,
          metadata: {
            reason: reason.data,
            platformRole: params.admin.platformRole,
            before: result.before,
            after: result.after,
          },
        },
        tx,
      );
    });
    await this.entitlements.invalidate(params.salonId);
    return { auditId };
  }

  /**
   * Step-up for destructive actions: the session must come from a sign-in within the last
   * ADMIN_STEP_UP_MINUTES. Cheap stand-in until admin TOTP/passkeys (topic 05 step 9).
   */
  private async assertFreshSignIn(admin: UserPrincipal): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: admin.sessionId },
      select: { createdAt: true },
    });
    const ageMs = session ? this.clock.now().getTime() - session.createdAt.getTime() : Infinity;
    if (ageMs > ADMIN_STEP_UP_MINUTES * 60_000) {
      throw new AppError(403, ADMIN_ERRORS.stepUpRequired, "Sign in again to confirm");
    }
  }
}

/** Salon suspension (topic 12 M12.6): read-only workspace, nothing granted, until unsuspended. */
export async function suspendSalon(db: Db, salonId: string, now: Date): Promise<AdminChange> {
  const salon = await db.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: { status: true, suspendedAt: true },
  });
  if (salon.status === "suspended") {
    throw new AppError(409, ADMIN_ERRORS.alreadySuspended, "Salon already suspended");
  }
  // Conditional update guards against a concurrent suspend.
  const { count } = await db.salon.updateMany({
    where: { id: salonId, status: salon.status },
    data: { status: "suspended", suspendedAt: now, preSuspensionStatus: salon.status },
  });
  if (count === 0) throw new AppError(409, ADMIN_ERRORS.alreadySuspended, "Changed concurrently");
  return {
    before: { status: salon.status, suspendedAt: null },
    after: { status: "suspended", suspendedAt: now.toISOString() },
    targetType: "salon",
    targetId: salonId,
  };
}

export async function unsuspendSalon(db: Db, salonId: string): Promise<AdminChange> {
  const salon = await db.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: { status: true, suspendedAt: true, preSuspensionStatus: true },
  });
  if (salon.status !== "suspended" || !salon.preSuspensionStatus) {
    throw new AppError(409, ADMIN_ERRORS.notSuspended, "Salon is not suspended");
  }
  const restored = salon.preSuspensionStatus;
  const { count } = await db.salon.updateMany({
    where: { id: salonId, status: "suspended" },
    data: { status: restored, suspendedAt: null, preSuspensionStatus: null },
  });
  if (count === 0) throw new AppError(409, ADMIN_ERRORS.notSuspended, "Changed concurrently");
  return {
    before: { status: "suspended", suspendedAt: salon.suspendedAt?.toISOString() ?? null },
    after: { status: restored, suspendedAt: null },
    targetType: "salon",
    targetId: salonId,
  };
}
