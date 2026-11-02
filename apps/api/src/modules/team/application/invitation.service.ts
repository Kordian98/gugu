import { createHmac, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  type CreateInvitationInput,
  createInvitationInputSchema,
  type InvitationCreated,
  type InvitationPreview,
  TEAM_ERRORS,
} from "@gugu/contracts";
import type { SalonContext, UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { MailService } from "../../../infrastructure/mail/mail.service";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";
import { renderInvitationEmail } from "./invitation-email";

const TTL_MS = 72 * 3600 * 1000;

/**
 * Minimal staff invitation flow (spec 05 R6, implemented by 07 until 05 takes it over): single use,
 * 72 h, only the HMAC is stored. Email-bound invitations can be accepted only by a signed-in user
 * whose verified email matches; link-only invitations are shared out of band (Zalo/copy, no SMS).
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
  ) {}

  private hash(token: string): string {
    return createHmac("sha256", this.config.env.AUTH_SECRET)
      .update(`invitation\u0000${token}`)
      .digest("base64url");
  }

  async create(
    ctx: SalonContext,
    user: UserPrincipal,
    raw: CreateInvitationInput,
  ): Promise<InvitationCreated> {
    const input = createInvitationInputSchema.parse(raw);
    if (input.role === "manager" && ctx.role !== "owner") {
      throw new AppError(403, COMMON_ERRORS.forbidden, "Only the owner can invite managers");
    }
    await this.assertSeat(ctx);
    if (input.staffProfileId) {
      const staff = await this.prisma.staffProfile.findFirst({
        where: {
          id: input.staffProfileId,
          salonId: ctx.salonId,
          deletedAt: null,
          salonMemberId: null,
        },
      });
      if (!staff) throw new AppError(404, TEAM_ERRORS.staffNotFound, "Staff not found");
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL_MS);
    const salon = await this.prisma.salon.findUniqueOrThrow({
      where: { id: ctx.salonId },
      select: { name: true },
    });
    const invitation = await this.prisma.$transaction(async (tx) => {
      if (input.staffProfileId) {
        await tx.salonInvitation.updateMany({
          where: {
            salonId: ctx.salonId,
            staffProfileId: input.staffProfileId,
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }
      const row = await tx.salonInvitation.create({
        data: {
          salonId: ctx.salonId,
          role: input.role,
          email: input.email ?? null,
          staffProfileId: input.staffProfileId ?? null,
          tokenHash: this.hash(token),
          invitedById: user.userId,
          expiresAt,
        },
      });
      await this.audit.record(
        {
          action: "team.invitation_created",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "salon_invitation",
          targetId: row.id,
          metadata: { role: input.role, emailBound: input.email !== undefined },
        },
        tx,
      );
      return row;
    });
    const acceptUrl = new URL(`/${input.locale}/join-team`, this.config.env.WEB_APP_URL);
    acceptUrl.searchParams.set("token", token);
    let emailSent = false;
    if (input.email) {
      await this.mail.send(
        renderInvitationEmail({
          locale: input.locale,
          to: input.email,
          link: acceptUrl.toString(),
          salonName: salon.name,
        }),
      );
      emailSent = true;
    }
    return {
      id: invitation.id,
      acceptUrl: acceptUrl.toString(),
      expiresAt: expiresAt.toISOString(),
      emailSent,
    };
  }

  async revoke(ctx: SalonContext, invitationId: string): Promise<void> {
    const { count } = await this.prisma.salonInvitation.updateMany({
      where: { id: invitationId, salonId: ctx.salonId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new AppError(404, TEAM_ERRORS.invitationInvalid, "Not found");
    await this.audit.record({
      action: "team.invitation_revoked",
      salonId: ctx.salonId,
      organizationId: ctx.organizationId,
      targetType: "salon_invitation",
      targetId: invitationId,
    });
  }

  async preview(token: string): Promise<InvitationPreview> {
    const inv = await this.prisma.salonInvitation.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { salon: { select: { name: true } } },
    });
    if (!inv || inv.revokedAt)
      throw new AppError(404, TEAM_ERRORS.invitationInvalid, "Invalid invitation");
    return {
      salonName: inv.salon.name,
      role: inv.role,
      emailBound: inv.email !== null,
      status: inv.acceptedAt ? "used" : inv.expiresAt <= new Date() ? "expired" : "valid",
    };
  }

  async accept(user: UserPrincipal, token: string): Promise<{ salonId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.salonInvitation.findUnique({ where: { tokenHash: this.hash(token) } });
      const now = new Date();
      if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt <= now) {
        throw new AppError(400, TEAM_ERRORS.invitationInvalid, "Invalid or expired invitation");
      }
      const account = await tx.user.findUniqueOrThrow({
        where: { id: user.userId },
        select: { email: true, emailVerifiedAt: true, profile: { select: { displayName: true } } },
      });
      if (
        inv.email &&
        (account.email?.toLowerCase() !== inv.email.toLowerCase() || !account.emailVerifiedAt)
      ) {
        throw new AppError(
          403,
          TEAM_ERRORS.invitationEmailMismatch,
          "Invitation is for another email",
        );
      }
      const existing = await tx.salonMember.findUnique({
        where: { salonId_userId: { salonId: inv.salonId, userId: user.userId } },
      });
      if (existing && existing.status !== "removed") {
        throw new AppError(409, TEAM_ERRORS.alreadyMember, "Already a member");
      }
      // Single use even under concurrent accepts: only one update matches acceptedAt = null.
      const claimed = await tx.salonInvitation.updateMany({
        where: { id: inv.id, acceptedAt: null },
        data: { acceptedAt: now, acceptedByUserId: user.userId },
      });
      if (claimed.count !== 1)
        throw new AppError(400, TEAM_ERRORS.invitationInvalid, "Invitation already used");
      const member = existing
        ? await tx.salonMember.update({
            where: { id: existing.id },
            data: {
              role: inv.role,
              status: "active",
              invitedById: inv.invitedById,
              permissionsOverride: Prisma.DbNull,
            },
          })
        : await tx.salonMember.create({
            data: {
              salonId: inv.salonId,
              userId: user.userId,
              role: inv.role,
              status: "active",
              invitedById: inv.invitedById,
            },
          });
      const displayName = account.profile?.displayName ?? account.email?.split("@")[0] ?? "—";
      if (inv.staffProfileId) {
        await tx.staffProfile.update({
          where: { id: inv.staffProfileId },
          data: { salonMemberId: member.id },
        });
      } else {
        const last = await tx.staffProfile.aggregate({
          where: { salonId: inv.salonId, deletedAt: null },
          _max: { sortOrder: true },
        });
        await tx.staffProfile.create({
          data: {
            salonId: inv.salonId,
            salonMemberId: member.id,
            displayName,
            isBookable: inv.role === "staff",
            sortOrder: (last._max.sortOrder ?? -1) + 1,
          },
        });
      }
      const salon = await tx.salon.findUniqueOrThrow({
        where: { id: inv.salonId },
        select: { organizationId: true },
      });
      await this.audit.record(
        {
          action: "team.invitation_accepted",
          salonId: inv.salonId,
          organizationId: salon.organizationId,
          targetType: "salon_member",
          targetId: member.id,
          metadata: { role: inv.role },
        },
        tx,
      );
      return { salonId: inv.salonId };
    });
  }

  async changeRole(
    ctx: SalonContext,
    memberId: string,
    role: "manager" | "receptionist" | "staff",
  ): Promise<void> {
    const member = await this.prisma.salonMember.findFirst({
      where: { id: memberId, salonId: ctx.salonId },
    });
    if (!member || member.status === "removed")
      throw new AppError(404, COMMON_ERRORS.notFound, "Not found");
    if (member.role === "owner")
      throw new AppError(403, TEAM_ERRORS.cannotChangeOwner, "Owner role cannot change");
    await this.prisma.$transaction(async (tx) => {
      await tx.salonMember.update({ where: { id: memberId }, data: { role } });
      await this.audit.record(
        {
          action: "team.member_role_changed",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "salon_member",
          targetId: memberId,
          metadata: { from: member.role, to: role },
        },
        tx,
      );
    });
  }

  /** `staff.max_seats` (topic 12) counts members who are not removed plus open invitations. */
  private async assertSeat(ctx: SalonContext): Promise<void> {
    const limit = await this.entitlements.limit(ctx.salonId, "staff.max_seats");
    if (limit === "unlimited") return;
    const [members, invites] = await Promise.all([
      this.prisma.salonMember.count({
        where: { salonId: ctx.salonId, status: { not: "removed" } },
      }),
      this.prisma.salonInvitation.count({
        where: {
          salonId: ctx.salonId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    if (members + invites >= limit) {
      throw new AppError(403, TEAM_ERRORS.seatLimitReached, "Seat limit reached", {
        detail: String(limit),
      });
    }
  }
}
