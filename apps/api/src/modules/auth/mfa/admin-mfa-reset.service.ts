import { Injectable } from "@nestjs/common";
import { ADMIN_MFA_ERRORS, type AdminTeamList } from "@gugu/contracts";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

type Db = Prisma.TransactionClient;
type Snapshot = Record<string, string | number | boolean | null>;

/**
 * Admin team and the admin-assisted 2FA reset (owner answer q93, ADR-0011 amendment). The auth
 * module owns the factor, recovery-code and session tables, so the reset lives here; the admin
 * module's `AdminActions.runOnAdmin` wraps it with the reason, the actor's step-up and the audit
 * row. Never returns secrets.
 */
@Injectable()
export class AdminMfaResetService {
  constructor(private readonly prisma: PrismaService) {}

  /** GuGu admins with their 2FA state, for the super_admin reset (q93). No secrets. */
  async team(actor: UserPrincipal): Promise<AdminTeamList> {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: { platformRole: { not: null }, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        platformRole: true,
        adminMfaFactor: { select: { confirmedAt: true } },
        _count: {
          select: {
            adminRecoveryCodes: { where: { usedAt: null } },
            sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
          },
        },
      },
      take: 200,
    });
    return {
      items: users.flatMap((u) =>
        u.platformRole
          ? [
              {
                userId: u.id,
                email: u.email,
                platformRole: u.platformRole,
                isSelf: u.id === actor.userId,
                mfaEnrolled: !!u.adminMfaFactor?.confirmedAt,
                mfaEnrolledAt: u.adminMfaFactor?.confirmedAt?.toISOString() ?? null,
                recoveryCodesRemaining: u.adminMfaFactor?.confirmedAt
                  ? u._count.adminRecoveryCodes
                  : 0,
                activeSessions: u._count.sessions,
              },
            ]
          : [],
      ),
    };
  }

  /**
   * q93 (lost device AND recovery codes): a second super_admin resets another admin's factor.
   * Runs inside AdminActions.runOnAdmin (reason, the actor's own step-up, audit row in the same
   * transaction). Deletes the factor (incl. a pending enrolment) and every recovery code, and
   * revokes every session of the target — which also ends any step-up elevation. The target must
   * sign in again (fresh sign-in rule) and re-enrol before any admin write. Never oneself.
   */
  async resetFactorsFor(
    db: Db,
    actor: UserPrincipal,
    targetUserId: string,
  ): Promise<{ before: Snapshot; after: Snapshot; targetType: string; targetId: string }> {
    if (targetUserId === actor.userId) {
      throw new AppError(
        403,
        ADMIN_MFA_ERRORS.resetSelfForbidden,
        "Use your own recovery codes; another super_admin must reset your factor",
      );
    }
    // Lock the target row so a parallel reset or role change cannot interleave.
    const rows = await db.$queryRaw<{ platform_role: string | null }[]>`
      SELECT platform_role::text AS platform_role FROM users
      WHERE id = ${targetUserId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const role = rows[0]?.platform_role ?? null;
    if (!role) throw new AppError(404, COMMON_ERRORS.notFound, "Admin not found");
    const factor = await db.adminMfaFactor.findUnique({
      where: { userId: targetUserId },
      select: { confirmedAt: true },
    });
    const codes = await db.adminRecoveryCode.deleteMany({ where: { userId: targetUserId } });
    const factors = await db.adminMfaFactor.deleteMany({ where: { userId: targetUserId } });
    const now = new Date();
    const sessions = await db.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now, revokeReason: "admin_mfa_reset", stepUpUntil: null },
    });
    return {
      before: {
        enrolled: !!factor?.confirmedAt,
        factorRows: factors.count,
        recoveryCodes: codes.count,
        activeSessions: sessions.count,
      },
      after: { enrolled: false, recoveryCodes: 0, activeSessions: 0, targetPlatformRole: role },
      targetType: "user",
      targetId: targetUserId,
    };
  }
}
