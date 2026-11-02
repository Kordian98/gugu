import { Injectable } from "@nestjs/common";
import type { PendingSalonList } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";

type Tx = Prisma.TransactionClient;

/**
 * Owner memberships waiting for the email owner's consent (`pending_verification`). They become
 * active only through intent for that specific salon: its registration link, or an explicit
 * confirm after sign-in. Declining removes the membership.
 */
@Injectable()
export class PendingMembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<PendingSalonList> {
    const rows = await this.prisma.salonMember.findMany({
      where: { userId, status: "pending_verification", salon: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { salonId: true, createdAt: true, salon: { select: { name: true } } },
    });
    return {
      items: rows.map((r) => ({
        salonId: r.salonId,
        salonName: r.salon.name,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Activates the user's pending salon membership and its organisation membership; audited. */
  async activate(tx: Tx, userId: string, salonId: string): Promise<boolean> {
    const salon = await tx.salon.findUnique({
      where: { id: salonId },
      select: { organizationId: true },
    });
    if (!salon) return false;
    const activated = await tx.salonMember.updateMany({
      where: { salonId, userId, status: "pending_verification" },
      data: { status: "active" },
    });
    if (activated.count === 0) return false;
    await tx.organizationMember.updateMany({
      where: { organizationId: salon.organizationId, userId, status: "pending_verification" },
      data: { status: "active" },
    });
    await this.audit.record(
      {
        action: "salon.owner_verified",
        actor: { type: "user", id: userId },
        salonId,
        organizationId: salon.organizationId,
        targetType: "salon",
        targetId: salonId,
      },
      tx,
    );
    return true;
  }

  async confirm(userId: string, salonId: string): Promise<void> {
    const ok = await this.prisma.$transaction((tx) => this.activate(tx, userId, salonId));
    if (!ok) throw new AppError(404, COMMON_ERRORS.notFound, "Not found");
  }

  /** "Not my salon": removes the pending memberships (the draft salon stays ownerless). */
  async decline(userId: string, salonId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const salon = await tx.salon.findUnique({
        where: { id: salonId },
        select: { organizationId: true },
      });
      const removed = await tx.salonMember.updateMany({
        where: { salonId, userId, status: "pending_verification" },
        data: { status: "removed" },
      });
      if (!salon || removed.count === 0) {
        throw new AppError(404, COMMON_ERRORS.notFound, "Not found");
      }
      await tx.organizationMember.updateMany({
        where: { organizationId: salon.organizationId, userId, status: "pending_verification" },
        data: { status: "removed" },
      });
      await this.audit.record(
        {
          action: "salon.owner_declined",
          actor: { type: "user", id: userId },
          salonId,
          organizationId: salon.organizationId,
          targetType: "salon",
          targetId: salonId,
        },
        tx,
      );
    });
  }
}
