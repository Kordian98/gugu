import { Injectable } from "@nestjs/common";
import {
  SALON_ERRORS,
  type SalonRegistrationInput,
  type SalonRegistrationResult,
} from "@gugu/contracts";
import { normalizeVnPhone } from "@gugu/domain";
import type { Principal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { RateLimitService } from "../../../infrastructure/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.facade";
import { AccountsService, MagicLinkService, type RequestMeta } from "../../auth/auth.facade";
import { SubscriptionsFacade } from "../../subscriptions/subscriptions.facade";
import { uniqueSlug } from "./slug";

/**
 * Salon registration (spec 05 milestone 3, contract agreed with topic 07). One transaction creates
 * organisation + org owner membership + salon (draft) + location + salon owner membership + the
 * 14-day trial (topic 12). Signed-in callers become active owners; anonymous callers give an email,
 * their memberships stay `pending_verification` until they open the emailed magic link.
 */
@Injectable()
export class RegisterSalonCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly magicLinks: MagicLinkService,
    private readonly subscriptions: SubscriptionsFacade,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    input: SalonRegistrationInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<SalonRegistrationResult> {
    await this.rateLimit.consume(
      { name: "salons.register.ip", limit: 10, windowSeconds: 3600 },
      meta.ipPrefix ?? "none",
    );
    const signedIn = principal.kind === "user";
    if (!signedIn && !input.email) {
      throw new AppError(400, SALON_ERRORS.emailRequired, "Email required when not signed in", {
        errors: [{ path: "email", code: "required" }],
      });
    }
    const phone = normalizeVnPhone(input.phone);
    if (!phone) {
      throw new AppError(400, SALON_ERRORS.invalidPhone, "Invalid phone number", {
        errors: [{ path: "phone", code: "invalid_phone" }],
      });
    }
    await this.assertReferences(input);
    const memberStatus = signedIn ? "active" : "pending_verification";

    const result = await this.prisma.$transaction(async (tx) => {
      const owner = signedIn
        ? await tx.user.findUniqueOrThrow({ where: { id: principal.userId } })
        : await this.accounts.findOrCreateUnverifiedByEmail(input.email ?? "", input.locale, tx);
      if (signedIn) {
        await this.rateLimit.consume(
          { name: "salons.register.user", limit: 5, windowSeconds: 86_400 },
          owner.id,
        );
      }
      const organization = await tx.organization.create({
        data: {
          name: input.businessName,
          slug: uniqueSlug(input.businessName),
          ownerUserId: owner.id,
          defaultLocale: input.locale,
          locationsHint: input.locationsHint,
          members: { create: { userId: owner.id, role: "org_owner", status: memberStatus } },
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
          members: { create: { userId: owner.id, role: "owner", status: memberStatus } },
        },
      });
      await this.subscriptions.startTrial({ salonId: salon.id }, tx);
      await this.audit.record(
        {
          action: "salon.registered",
          actor: signedIn ? { type: "user", id: owner.id } : { type: "anonymous" },
          salonId: salon.id,
          organizationId: organization.id,
          targetType: "salon",
          targetId: salon.id,
          metadata: { ownerVerified: signedIn, locationsHint: input.locationsHint },
          ipPrefix: meta.ipPrefix,
          userAgent: meta.userAgent,
        },
        tx,
      );
      return { organization, salon, ownerEmail: owner.email };
    });

    if (!signedIn && result.ownerEmail) {
      // After commit: never email about a salon that was rolled back.
      await this.magicLinks.issue(
        {
          email: result.ownerEmail,
          locale: input.locale,
          client: "web",
          purpose: "salon_registration",
          salonId: result.salon.id,
          salonName: result.salon.name,
          redirectPath: `/${input.locale}/business`,
        },
        meta,
      );
    }
    return {
      salonId: result.salon.id,
      salonSlug: result.salon.slug,
      organisationId: result.organization.id,
      status: "draft",
      magicLinkStatus: signedIn ? "not_required" : "sent",
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
