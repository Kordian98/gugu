import { Injectable } from "@nestjs/common";
import type { Locale } from "@gugu/contracts";
import type { SalonPermission } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { MembershipService } from "../../authorization/authorization.facade";

export interface TeamRecipient {
  userId: string;
  /** Verified sign-in email, or null. */
  email: string | null;
  locale: Locale;
  emailEnabled: boolean;
}

export interface RecipientRule {
  full: SalonPermission;
  /** `.own` variant: allowed only for bookings of the member's own staff profile. */
  own: SalonPermission | null;
}

/**
 * Team recipients (spec 11 G11) from the permission matrix, resolved like a request would be
 * (`MembershipService`: salon + organisation membership, role, overrides). Staff with only the
 * `.own` permission receive booking notifications only for their own bookings.
 */
@Injectable()
export class RecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  /** May this member see a notification about bookings of these staff ids? */
  async allowed(
    ctx: SalonContext | null,
    userId: string,
    rule: RecipientRule,
    staffIds: readonly string[],
  ): Promise<boolean> {
    if (!ctx) return false;
    if (ctx.permissions.has(rule.full)) return true;
    if (!rule.own || !ctx.permissions.has(rule.own) || staffIds.length === 0) return false;
    const own = await this.prisma.staffProfile.findFirst({
      where: {
        salonId: ctx.salonId,
        deletedAt: null,
        id: { in: [...staffIds] },
        member: { userId },
      },
      select: { id: true },
    });
    return own !== null;
  }

  async forTeam(
    salonId: string,
    rule: RecipientRule,
    staffIds: readonly string[],
    excludeUserId: string | null,
  ): Promise<TeamRecipient[]> {
    const salon = await this.prisma.salon.findFirst({
      where: { id: salonId, deletedAt: null },
      select: {
        members: { where: { status: "active" }, select: { userId: true } },
        organization: {
          select: { members: { where: { status: "active" }, select: { userId: true } } },
        },
      },
    });
    if (!salon) return [];
    const candidates = [
      ...new Set([
        ...salon.members.map((m) => m.userId),
        ...salon.organization.members.map((m) => m.userId),
      ]),
    ].filter((id) => id !== excludeUserId);
    const ok: string[] = [];
    for (const userId of candidates) {
      const ctx = await this.membership.resolve(userId, salonId);
      if (await this.allowed(ctx, userId, rule, staffIds)) ok.push(userId);
    }
    if (ok.length === 0) return [];
    const [users, prefs] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ok }, status: "active", deletedAt: null },
        select: { id: true, email: true, emailVerifiedAt: true, preferredLocale: true },
      }),
      this.prisma.notificationMemberPref.findMany({
        where: { salonId, userId: { in: ok } },
        select: { userId: true, emailEnabled: true },
      }),
    ]);
    const muted = new Set(prefs.filter((p) => !p.emailEnabled).map((p) => p.userId));
    return users
      .map((u) => ({
        userId: u.id,
        email: u.email && u.emailVerifiedAt ? u.email : null,
        locale: u.preferredLocale,
        emailEnabled: !muted.has(u.id),
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));
  }
}
