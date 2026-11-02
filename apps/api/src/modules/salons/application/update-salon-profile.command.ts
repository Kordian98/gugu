import { Injectable } from "@nestjs/common";
import type { UpdateSalonProfileInput } from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";

/** Owner/manager edits the salon's basic profile (audited, spec 05 R29). */
@Injectable()
export class UpdateSalonProfileCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(ctx: SalonContext, input: UpdateSalonProfileInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.salon.update({
        where: { id: ctx.salonId, organizationId: ctx.organizationId },
        data: { name: input.name },
      });
      await this.audit.record(
        {
          action: "salon.profile_updated",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "salon",
          targetId: ctx.salonId,
          metadata: { fields: "name" },
        },
        tx,
      );
    });
  }
}
