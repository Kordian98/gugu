import { Injectable } from "@nestjs/common";
import {
  SALON_ERRORS,
  type SalonRegistrationInput,
  type SalonRegistrationResult,
} from "@gugu/contracts";
import { normalizeVnPhone } from "@gugu/domain";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { RateLimitService } from "../../../infrastructure/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.facade";
import type { RequestMeta } from "../../auth/auth.facade";
import { SubscriptionsFacade } from "../../subscriptions/subscriptions.facade";
import { uniqueSlug } from "./slug";

/**
 * Salon registration with full details (spec 05 milestone 3), **signed-in callers only** since
 * ADR-0018: the anonymous variant (pending owner membership confirmed by an emailed link) is retired
 * so nobody can create salons, or pending salons, without proving an email first. The app's signup
 * uses `POST /salons/quick-start`; this endpoint stays for scripted setups (demo seed). One
 * transaction creates organisation + org owner + salon (draft) + location + owner membership + the
 * trial (topic 12) + an audit entry.
 */
@Injectable()
export class RegisterSalonCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsFacade,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    input: SalonRegistrationInput,
    user: UserPrincipal,
    meta: RequestMeta,
  ): Promise<SalonRegistrationResult> {
    await this.rateLimit.consume(
      { name: "salons.register.ip", limit: 10, windowSeconds: 3600 },
      meta.ipPrefix ?? `user:${user.userId}`,
    );
    await this.rateLimit.consume(
      { name: "salons.register.user", limit: 5, windowSeconds: 86_400 },
      user.userId,
    );
    const phone = normalizeVnPhone(input.phone);
    if (!phone) {
      throw new AppError(400, SALON_ERRORS.invalidPhone, "Invalid phone number", {
        errors: [{ path: "phone", code: "invalid_phone" }],
      });
    }
    await this.assertReferences(input);

    const result = await this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.findUniqueOrThrow({ where: { id: user.userId } });
      const organization = await tx.organization.create({
        data: {
          name: input.businessName,
          slug: uniqueSlug(input.businessName),
          ownerUserId: owner.id,
          defaultLocale: input.locale,
          locationsHint: input.locationsHint,
          members: { create: { userId: owner.id, role: "org_owner", status: "active" } },
        },
      });
      const salon = await tx.salon.create({
        data: {
          organizationId: organization.id,
          slug: uniqueSlug(input.businessName),
          name: input.businessName,
          status: "draft",
          defaultLocale: input.locale,
          ownerUserId: owner.id,
          phoneE164: phone,
          primaryCategoryId: input.categoryId,
          location: {
            create: {
              addressLine: input.streetAddress,
              provinceId: input.provinceId,
              wardId: input.wardId,
            },
          },
          members: { create: { userId: owner.id, role: "owner", status: "active" } },
        },
      });
      await this.subscriptions.startTrial({ salonId: salon.id }, tx);
      await this.audit.record(
        {
          action: "salon.registered",
          actor: { type: "user", id: owner.id },
          salonId: salon.id,
          organizationId: organization.id,
          targetType: "salon",
          targetId: salon.id,
          metadata: { ownerVerified: true, locationsHint: input.locationsHint },
          ipPrefix: meta.ipPrefix,
          userAgent: meta.userAgent,
        },
        tx,
      );
      return { organization, salon };
    });
    return {
      salonId: result.salon.id,
      salonSlug: result.salon.slug,
      organisationId: result.organization.id,
      status: "draft",
      magicLinkStatus: "not_required",
    };
  }

  private async assertReferences(input: SalonRegistrationInput): Promise<void> {
    const [category, province, ward] = await Promise.all([
      this.prisma.serviceCategory.findFirst({ where: { id: input.categoryId, isActive: true } }),
      this.prisma.location.findFirst({
        where: { id: input.provinceId, level: "province", isActive: true },
      }),
      this.prisma.location.findFirst({
        where: { id: input.wardId, level: "ward", parentId: input.provinceId, isActive: true },
      }),
    ]);
    if (!category) {
      throw new AppError(400, SALON_ERRORS.unknownCategory, "Unknown category", {
        errors: [{ path: "categoryId", code: "unknown" }],
      });
    }
    if (!province || !ward) {
      throw new AppError(400, SALON_ERRORS.unknownLocation, "Unknown province or ward", {
        errors: [{ path: province ? "wardId" : "provinceId", code: "unknown" }],
      });
    }
  }
}
