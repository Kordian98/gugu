import { Injectable, Logger } from "@nestjs/common";
import { SALON_ERRORS, type SalonQuickStartResult } from "@gugu/contracts";
import { emailDomain, isDisposableEmail, isMajorEmailProvider } from "@gugu/domain";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
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

type Tx = Prisma.TransactionClient;

/**
 * Email-only signup (owner 2026-11-04, ADR-0018): the signed-in user's first salon, created lazily
 * so nothing has to be filled in before entering the app. One transaction creates the organisation
 * + org owner, the draft salon (no name yet — the first, mandatory setup step names it, q103;
 * Asia/Ho_Chi_Minh, vi), default settings, the active owner membership, the trial + free Basic year
 * (X25/q96; the trial's AI allowance only starts once the salon is named), the setup row and an
 * audit entry. A per-user advisory lock makes it idempotent.
 *
 * Refused for platform admins (403), disposable email domains (422), and — unless the user chose
 * "create my own salon" (`ignoreInvitations`) — when a team invitation exists for their email
 * (409 `salon.invitation_pending`, q102: invited staff never get an empty salon of their own).
 * Abuse brakes: per user, per IP (or per user when the IP is unknown), per email domain, and a
 * global daily cap that logs an error when reached.
 */
@Injectable()
export class QuickStartSalonCommand {
  private readonly logger = new Logger(QuickStartSalonCommand.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly subscriptions: SubscriptionsFacade,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  async execute(
    user: UserPrincipal,
    input: { locale: "vi" | "en"; ignoreInvitations: boolean },
    meta: RequestMeta,
  ): Promise<SalonQuickStartResult> {
    if (user.platformRole !== null) {
      throw new AppError(403, SALON_ERRORS.quickStartNotAllowed, "Platform admins own no salon");
    }
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
      const account = await tx.user.findUniqueOrThrow({
        where: { id: user.userId },
        select: { email: true },
      });
      const email = account.email ?? "";
      if (!input.ignoreInvitations && (await this.hasInvitation(tx, user.userId, email))) {
        throw new AppError(409, SALON_ERRORS.invitationPending, "A team invitation exists");
      }
      if (isDisposableEmail(email)) {
        throw new AppError(422, SALON_ERRORS.emailNotAllowed, "Disposable email domain");
      }
      await this.consumeLimits(user.userId, email, meta);

      const organization = await tx.organization.create({
        data: {
          // No placeholder anywhere (q103): empty until the first setup step names the salon.
          name: "",
          slug: uniqueSlug("salon"),
          ownerUserId: user.userId,
          defaultLocale: "vi",
          locationsHint: "1",
          members: { create: { userId: user.userId, role: "org_owner", status: "active" } },
        },
      });
      const salon = await tx.salon.create({
        data: {
          organizationId: organization.id,
          slug: uniqueSlug("salon"),
          name: "",
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
          props: { locale: input.locale },
        },
        tx,
      );
      return { salonId: salon.id, created: true };
    });
  }

  /** An open invitation to this email, or one this user accepted before (now without a salon). */
  private async hasInvitation(tx: Tx, userId: string, email: string): Promise<boolean> {
    const open = email
      ? [
          {
            email: { equals: email, mode: "insensitive" as const },
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
        ]
      : [];
    const found = await tx.salonInvitation.findFirst({
      where: { revokedAt: null, OR: [...open, { acceptedByUserId: userId }] },
      select: { id: true },
    });
    return found !== null;
  }

  private async consumeLimits(userId: string, email: string, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume(QUICK_START_LIMITS.user, userId);
    // Never one shared bucket for every request without a known client IP.
    await this.rateLimit.consume(QUICK_START_LIMITS.ip, meta.ipPrefix ?? `user:${userId}`);
    const domain = emailDomain(email);
    if (domain && !isMajorEmailProvider(email)) {
      // Per email domain, except large consumer providers (gmail.com, yahoo.com.vn, …).
      await this.rateLimit.consume(
        {
          name: "salons.quick_start.domain",
          limit: this.config.env.QUICK_START_DOMAIN_DAILY_LIMIT,
          windowSeconds: 86_400,
        },
        domain,
      );
    }
    const cap = this.config.env.QUICK_START_DAILY_CAP;
    try {
      await this.rateLimit.consume(
        { name: "salons.quick_start.global", limit: cap, windowSeconds: 86_400 },
        "all",
      );
    } catch (err) {
      if (err instanceof AppError && err.status === 429) {
        // Alert: either real growth (raise QUICK_START_DAILY_CAP) or trial farming.
        this.logger.error({ cap }, "quick-start global daily cap reached");
      }
      throw err;
    }
  }
}
