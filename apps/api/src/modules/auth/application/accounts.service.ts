import { Injectable } from "@nestjs/common";
import { AUTH_ERRORS, type Locale, type Me, type Membership } from "@gugu/contracts";
import { ORGANIZATION_ROLE_AS_SALON_ROLE, type SalonRole, strongestRole } from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma, User } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

type Db = Prisma.TransactionClient;

/** User accounts: creation on first proof of email, status checks and the `/me` read model. */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds or creates the user for an email whose control was just proven (magic link or a
   * provider-verified email). New users get a profile. No `customers` row: customers never have
   * accounts (X21/X23); salon members are the only users.
   */
  async upsertVerifiedByEmail(email: string, locale: Locale, db: Db): Promise<User> {
    const now = new Date();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      this.assertUsable(existing);
      return db.user.update({
        where: { id: existing.id },
        data: { emailVerifiedAt: existing.emailVerifiedAt ?? now, lastLoginAt: now },
      });
    }
    return db.user.create({
      data: {
        email,
        emailVerifiedAt: now,
        lastLoginAt: now,
        preferredLocale: locale,
        profile: { create: {} },
      },
    });
  }

  /**
   * For salon registration without a session: the user exists (unverified) so the pending owner
   * membership can point at it. Proving the email later (magic link) verifies it.
   */
  async findOrCreateUnverifiedByEmail(email: string, locale: Locale, db: Db): Promise<User> {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return existing;
    return db.user.create({
      data: {
        email,
        preferredLocale: locale,
        profile: { create: {} },
      },
    });
  }

  assertUsable(user: Pick<User, "status">): void {
    if (user.status === "suspended" || user.status === "deleted") {
      throw new AppError(403, AUTH_ERRORS.accountUnavailable, "Account unavailable");
    }
  }

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: { select: { displayName: true } },
        salonMemberships: {
          where: { status: { in: ["active", "pending_verification"] }, salon: { deletedAt: null } },
          // Most recently joined first: the workspace opens it unless the user picked another
          // salon on this device (ADR-0018; e.g. right after accepting an invitation).
          orderBy: { createdAt: "desc" },
          include: {
            salon: { select: { id: true, name: true, slug: true, organizationId: true } },
          },
        },
        orgMemberships: {
          where: { status: "active" },
          include: {
            organization: {
              select: {
                salons: {
                  where: { deletedAt: null },
                  select: { id: true, name: true, slug: true, organizationId: true },
                },
              },
            },
          },
        },
      },
    });
    const bySalon = new Map<string, Membership>();
    const put = (
      salon: { id: string; name: string; slug: string; organizationId: string },
      role: SalonRole,
      status: Membership["status"],
    ) => {
      const prev = bySalon.get(salon.id);
      const best = strongestRole(prev?.role ?? null, role) ?? role;
      bySalon.set(salon.id, {
        salonId: salon.id,
        salonName: salon.name,
        salonSlug: salon.slug,
        organizationId: salon.organizationId,
        role: best,
        status: prev?.status === "active" || status === "active" ? "active" : status,
      });
    };
    for (const m of user.salonMemberships) {
      put(m.salon, m.role, m.status === "active" ? "active" : "pending_verification");
    }
    for (const m of user.orgMemberships) {
      const role = ORGANIZATION_ROLE_AS_SALON_ROLE[m.role];
      if (role) for (const salon of m.organization.salons) put(salon, role, "active");
    }
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      displayName: user.profile?.displayName ?? null,
      preferredLocale: user.preferredLocale,
      platformRole: user.platformRole,
      memberships: [...bySalon.values()],
    };
  }
}
