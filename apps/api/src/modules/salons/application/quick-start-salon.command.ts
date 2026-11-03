import { Injectable } from "@nestjs/common";
import { PLACEHOLDER_SALON_NAME, SALON_ERRORS, type SalonQuickStartResult } from "@gugu/contracts";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { RateLimitService } from "../../../infrastructure/rate-limit/rate-limit.service";
import { AnalyticsService } from "../../analytics/analytics.facade";
import { AuditService } from "../../audit/audit.facade";
import type { RequestMeta } from "../../auth/auth.facade";
import { SubscriptionsFacade } from "../../subscriptions/subscriptions.facade";
import { uniqueSlug } from "./slug";

export const QUICK_START_LIMITS = {
  user: { name: "salons.quick_start.user", limit: 5, windowSeconds: 86_400 },
  ip: { name: "salons.quick_start.ip", limit: 20, windowSeconds: 3600 },
} as const;

/**
 * Email-only signup (owner 2026-11-04): the signed-in user's first salon, created lazily with smart
 * defaults so nothing has to be filled in before entering the app. One transaction creates the
 * organisation + org owner, the draft salon (placeholder name, Asia/Ho_Chi_Minh, vi), settings with
 * the default booking window, the active owner membership, the trial + free Basic year (X25/q96),
 * the setup row and an audit entry. A per-user advisory lock makes it idempotent: a double click or
 * a retry returns the salon the user already owns.
 */
@Injectable()
export class QuickStartSalonCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsFacade,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  async execute(
    user: UserPrincipal,
    locale: "vi" | "en",
    meta: RequestMeta,
  ): Promise<SalonQuickStartResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`salon.quick_start:${user.userId}`}, 0))`;
      const memberships = await tx.salonMember.findMany({
        where: { userId: user.userId, role: "owner", salon: { deletedAt: null } },
        select: { salonId: true, status: true },
        orderBy: { createdAt: "asc" },
      });
      const owned = memberships.find((m) => m.status === "active");
      if (owned) return { salonId: owned.salonId, created: false };
      if (memberships.some((m) => m.status === "pending_verification")) {
        // Registered with the old form and never confirmed: confirm that salon instead (no second one).
        throw new AppError(409, SALON_ERRORS.pendingConfirmation, "A salon waits for confirmation");
      }
      await this.rateLimit.consume(QUICK_START_LIMITS.user, user.userId);
      await this.rateLimit.consume(QUICK_START_LIMITS.ip, meta.ipPrefix ?? "none");

      const name = PLACEHOLDER_SALON_NAME[locale];
      const organization = await tx.organization.create({
        data: {
          name,
          slug: uniqueSlug(name),
          ownerUserId: user.userId,
          defaultLocale: "vi",
          locationsHint: "1",
          members: { create: { userId: user.userId, role: "org_owner", status: "active" } },
        },
      });
      const salon = await tx.salon.create({
        data: {
          organizationId: organization.id,
          slug: uniqueSlug(name),
          name,
          status: "draft",
          timezone: "Asia/Ho_Chi_Minh",
          defaultLocale: "vi",
          ownerUserId: user.userId,
          members: { create: { userId: user.userId, role: "owner", status: "active" } },
          // Schema defaults: 60-day booking window, auto confirmation, 15-minute slots.
          settings: { create: {} },
          setup: { create: {} },
        },
      });
      await this.subscriptions.startTrial({ salonId: salon.id }, tx);
      await this.audit.record(
        {
          action: "salon.registered",
          actor: { type: "user", id: user.userId },
          salonId: salon.id,
          organizationId: organization.id,
          targetType: "salon",
          targetId: salon.id,
          metadata: { via: "quick_start", ownerVerified: true },
          ipPrefix: meta.ipPrefix,
          userAgent: meta.userAgent,
        },
        tx,
      );
      await this.analytics.record(
        {
          name: "salon_quick_started",
          salonId: salon.id,
          actorUserId: user.userId,
          props: { locale },
        },
        tx,
      );
      return { salonId: salon.id, created: true };
    });
  }
}
