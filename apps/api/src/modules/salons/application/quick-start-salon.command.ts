import { Injectable } from "@nestjs/common";
import { SALON_ERRORS, type SalonQuickStartResult } from "@gugu/contracts";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AnalyticsService } from "../../analytics/analytics.facade";
import { AuditService } from "../../audit/audit.facade";
import type { RequestMeta } from "../../auth/auth.facade";
import { SubscriptionsFacade } from "../../subscriptions/subscriptions.facade";
import { SignupGuard } from "./signup-guard";
import { uniqueSlug } from "./slug";

/**
 * Email-only signup (owner 2026-11-04, ADR-0018): the signed-in user's first salon, created lazily
 * so nothing has to be filled in before entering the app. One transaction creates the organisation
 * + org owner, the draft salon (no name yet — the first, mandatory setup step names it, q103;
 * Asia/Ho_Chi_Minh, vi), default settings, the active owner membership, the trial + free Basic year
 * (X25/q96; the trial's AI allowance only starts once the salon is named), the setup row and an
 * audit entry. A per-user advisory lock makes it idempotent.
 *
 * Every refusal and abuse brake lives in `SignupGuard`, the one gate for salon-creating signups:
 * platform admins (403), disposable email domains (422), a team invitation for the email unless the
 * user chose "create my own salon" (409 `salon.invitation_pending`, q102), and the per-user, per-IP,
 * per-registrable-domain and global daily limits.
 */
@Injectable()
export class QuickStartSalonCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: SignupGuard,
    private readonly subscriptions: SubscriptionsFacade,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  async execute(
    user: UserPrincipal,
    input: { locale: "vi" | "en"; ignoreInvitations: boolean },
    meta: RequestMeta,
  ): Promise<SalonQuickStartResult> {
    this.guard.assertPrincipal(user);
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
      await this.guard.assertEligible(tx, {
        userId: user.userId,
        email,
        ignoreInvitations: input.ignoreInvitations,
      });
      await this.guard.consume(user.userId, email, meta);

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
}
