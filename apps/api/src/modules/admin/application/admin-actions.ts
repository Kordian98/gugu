import { Injectable } from "@nestjs/common";
import { ADMIN_ERRORS, type AdminMutationResult, adminReasonSchema } from "@gugu/contracts";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { type AuditAction, AuditService } from "../../audit/audit.facade";
import { AdminMfaService, type RequestMeta } from "../../auth/auth.facade";
import { type AdminChange, EntitlementService } from "../../subscriptions/subscriptions.facade";

type Db = Prisma.TransactionClient;

export interface AdminActionParams {
  admin: UserPrincipal;
  action: AuditAction;
  salonId: string;
  reason: string;
  meta: RequestMeta;
  /**
   * High-risk: require a step-up — a TOTP/recovery code verified on this session within
   * ADMIN_STEP_UP_MINUTES (topic 05 step 9, ADR-0011). Every write needs an enrolled factor.
   */
  stepUp?: boolean;
}

/**
 * The only way the admin API changes anything (topic 12 M12.6, gate "every admin action has a
 * reason and an audit row"). In ONE transaction it checks the salon exists, applies the change and
 * writes the audit row (actor, platform role, reason, before, after). If the audit insert fails,
 * the change rolls back. After commit the salon's entitlement cache is invalidated. Before any of
 * that, the admin must have an enrolled second factor, and high-risk actions an active step-up.
 */
@Injectable()
export class AdminActions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
    private readonly mfa: AdminMfaService,
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
    await this.mfa.assertWriteAllowed(params.admin, { stepUp: params.stepUp === true });
    const actor = `admin:${params.admin.userId}`;
    let salonIds: string[] = [params.salonId];
    const auditId = await this.prisma.$transaction(async (tx) => {
      const salon = await tx.salon.findFirst({
        where: { id: params.salonId, deletedAt: null },
        select: { organizationId: true },
      });
      if (!salon) throw new AppError(404, COMMON_ERRORS.notFound, "Salon not found");
      const result = await change(tx, actor);
      if (result.salonIds) salonIds = [...new Set([params.salonId, ...result.salonIds])];
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
    // Founding-partner changes reach every salon of the organisation.
    await Promise.all(salonIds.map((id) => this.entitlements.invalidate(id)));
    return { auditId };
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
