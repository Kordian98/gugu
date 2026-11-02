import { Injectable } from "@nestjs/common";
import {
  ORG_VIEWER_PERMISSIONS,
  ORGANIZATION_ROLE_AS_SALON_ROLE,
  type PermissionOverride,
  type SalonPermission,
  type SalonRole,
  effectiveSalonPermissions,
  strongestRole,
} from "@gugu/domain";
import type { SalonContext } from "../../common/guards/principal";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

/**
 * Resolves a user's tenant context for one salon from `salon_members` and `organization_members`
 * (spec 05 §3.3–3.5). Read from the database on every request, so removing a member or changing a
 * role takes effect on their next request (AC9).
 */
@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, salonId: string): Promise<SalonContext | null> {
    const salon = await this.prisma.salon.findFirst({
      where: { id: salonId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        members: {
          where: { userId, status: "active" },
          select: { role: true, permissionsOverride: true },
        },
        organization: {
          select: { members: { where: { userId, status: "active" }, select: { role: true } } },
        },
      },
    });
    if (!salon) return null;
    const member = salon.members[0];
    const orgRole = salon.organization.members[0]?.role ?? null;
    const role: SalonRole | null = strongestRole(
      member?.role ?? null,
      orgRole ? ORGANIZATION_ROLE_AS_SALON_ROLE[orgRole] : null,
    );
    let permissions: ReadonlySet<SalonPermission>;
    if (role) {
      // Overrides apply only to the direct salon membership's role.
      const override =
        member && member.role === role
          ? (member.permissionsOverride as PermissionOverride | null)
          : null;
      permissions = effectiveSalonPermissions(role, override);
    } else if (orgRole === "org_viewer") {
      permissions = ORG_VIEWER_PERMISSIONS;
    } else {
      return null;
    }
    return {
      salonId: salon.id,
      organizationId: salon.organizationId,
      role: role ?? "staff",
      permissions,
    };
  }
}
