import { Injectable } from "@nestjs/common";
import type { SalonPermission } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

/** `null` = whole salon; otherwise the only staff profile whose bookings the member may see. */
export type CrmScope = { staffId: string | null };

/**
 * Same rule as the booking engine's readScope (topic 06, security review): the salon-wide
 * permission sees everything; the `.own` variant (staff role) only bookings of the member's own
 * staff profile; neither → 403. Routes stay gated by `schedules.read` and call this.
 */
@Injectable()
export class CrmScopes {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    salon: SalonContext,
    userId: string,
    full: SalonPermission,
    own: SalonPermission,
  ): Promise<CrmScope> {
    if (salon.permissions.has(full)) return { staffId: null };
    if (!salon.permissions.has(own)) throw forbidden();
    const profile = await this.prisma.staffProfile.findFirst({
      where: { salonId: salon.salonId, deletedAt: null, member: { userId } },
      select: { id: true },
    });
    if (!profile) throw forbidden();
    return { staffId: profile.id };
  }
}

const forbidden = () => new AppError(403, COMMON_ERRORS.forbidden, "Permission required");
