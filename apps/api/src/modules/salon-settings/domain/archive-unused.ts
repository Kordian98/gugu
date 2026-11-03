import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import type { AuditService } from "../../audit/audit.facade";

/**
 * q102 clean-up (owner 2026-11-04, ADR-0018): before invited staff were sent to "Join <salon>",
 * signing in first could create an empty quick-start salon of their own. When such a user accepts an
 * invitation, every salon they own that was never named (`salon_setups.name_confirmed = false`,
 * i.e. untouched: the name is the mandatory first step) is archived: soft-deleted (`deleted_at`, so
 * it disappears from `/me` and every query) and its owner memberships marked `removed`, audited as
 * `salon.archived_unused`. Named salons are never touched.
 */
export async function archiveUnusedQuickStartSalons(
  tx: Prisma.TransactionClient,
  userId: string,
  audit: AuditService,
): Promise<number> {
  const unused = await tx.salon.findMany({
    where: { ownerUserId: userId, deletedAt: null, setup: { nameConfirmed: false } },
    select: { id: true, organizationId: true },
  });
  const now = new Date();
  for (const salon of unused) {
    await tx.salon.update({ where: { id: salon.id }, data: { deletedAt: now } });
    await tx.salonMember.updateMany({
      where: { salonId: salon.id, userId },
      data: { status: "removed" },
    });
    await audit.record(
      {
        action: "salon.archived_unused",
        actor: { type: "user", id: userId },
        salonId: salon.id,
        organizationId: salon.organizationId,
        targetType: "salon",
        targetId: salon.id,
        metadata: { reason: "joined_team" },
      },
      tx,
    );
  }
  return unused.length;
}
