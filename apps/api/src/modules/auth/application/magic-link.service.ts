import { Injectable, Logger } from "@nestjs/common";
import {
  AUTH_ERRORS,
  type AuthClient,
  type Locale,
  type MagicLinkRequestInput,
  type MagicLinkVerifyInput,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { MailService } from "../../../infrastructure/mail/mail.service";
import type { MagicLinkToken, Prisma, User } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { RateLimitService } from "../../../infrastructure/rate-limit/rate-limit.service";
import { renderMagicLinkEmail } from "../infra/email-templates";
import type { RequestMeta } from "../infra/http-meta";
import { randomCode, randomToken, safeEqual, tokenHash } from "../infra/tokens";
import { AccountsService } from "./accounts.service";

const LINK_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export interface IssueMagicLink {
  email: string;
  locale: Locale;
  client: AuthClient;
  redirectPath?: string | null;
  purpose?: "sign_in" | "salon_registration";
  salonId?: string | null;
  salonName?: string;
}

export interface VerifiedMagicLink {
  user: User;
  link: MagicLinkToken;
}

/**
 * Email magic links (spec 05 R1/R2, X12). The email carries a link token and a 6-digit code (for
 * typing in the native app or on another device). Only HMACs are stored; links are single-use and
 * expire after 15 minutes. Request responses never reveal whether the email has an account.
 */
@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly rateLimit: RateLimitService,
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
  ) {}

  private hash(purpose: "magic" | "code" | "subject", value: string): string {
    return tokenHash(this.config.env.AUTH_SECRET, purpose, value);
  }

  /** Public endpoint: rate limits, then issues and sends (or silently skips for unusable accounts). */
  async request(input: MagicLinkRequestInput, meta: RequestMeta): Promise<void> {
    const subject = this.hash("subject", input.email);
    await this.rateLimit.consume(
      { name: "auth.magic_link.ip", limit: 30, windowSeconds: 900 },
      meta.ipPrefix ?? "none",
    );
    await this.rateLimit.consume(
      { name: "auth.magic_link.email", limit: 3, windowSeconds: 900 },
      subject,
    );
    await this.rateLimit.consume(
      { name: "auth.magic_link.email_day", limit: 10, windowSeconds: 86_400 },
      subject,
    );
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { status: true },
    });
    if (user && (user.status === "suspended" || user.status === "deleted")) return;
    await this.issue({ ...input, redirectPath: input.redirectPath ?? null }, meta);
  }

  /** Creates a link and emails it. Also used by salon registration (via the auth facade). */
  async issue(
    input: IssueMagicLink,
    meta: RequestMeta,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const token = randomToken();
    const code = randomCode();
    const user = await (tx ?? this.prisma).user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    await (tx ?? this.prisma).magicLinkToken.create({
      data: {
        email: input.email,
        userId: user?.id ?? null,
        purpose: input.purpose ?? "sign_in",
        tokenHash: this.hash("magic", token),
        codeHash: this.hash("code", `${input.email}:${code}`),
        client: input.client,
        locale: input.locale,
        redirectPath: input.redirectPath ?? null,
        salonId: input.salonId ?? null,
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
        ipPrefix: meta.ipPrefix,
      },
    });
    const link = new URL(`/${input.locale}/auth/verify`, this.config.env.WEB_APP_URL);
    link.searchParams.set("token", token);
    const mail = renderMagicLinkEmail({
      template: input.purpose === "salon_registration" ? "salonRegistration" : "magicLink",
      locale: input.locale,
      to: input.email,
      link: link.toString(),
      code,
      ...(input.salonName ? { salonName: input.salonName } : {}),
    });
    try {
      await this.mail.send(mail);
    } catch (err) {
      // Same response either way (no enumeration); the user can resend. Never log the address.
      this.logger.error({ err }, "magic link email failed");
    }
  }

  /**
   * Consumes a link (by token, or by email + code) and returns the now-verified user. Single use is
   * enforced atomically; wrong codes count towards a 5-attempt lock.
   */
  async verify(input: MagicLinkVerifyInput, meta: RequestMeta): Promise<VerifiedMagicLink> {
    await this.rateLimit.consume(
      { name: "auth.verify.ip", limit: 30, windowSeconds: 900 },
      meta.ipPrefix ?? "none",
    );
    const invalid = () =>
      new AppError(400, AUTH_ERRORS.invalidOrExpiredLink, "Link invalid or expired");
    const now = new Date();
    let link: MagicLinkToken | null;
    if ("token" in input) {
      link = await this.prisma.magicLinkToken.findUnique({
        where: { tokenHash: this.hash("magic", input.token) },
      });
    } else {
      link = await this.prisma.magicLinkToken.findFirst({
        where: { email: input.email, consumedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
      if (link) {
        const ok = safeEqual(link.codeHash, this.hash("code", `${input.email}:${input.code}`));
        if (!ok) {
          const attempts = link.attempts + 1;
          await this.prisma.magicLinkToken.update({
            where: { id: link.id },
            data: { attempts, ...(attempts >= MAX_CODE_ATTEMPTS ? { consumedAt: now } : {}) },
          });
          if (attempts >= MAX_CODE_ATTEMPTS) {
            throw new AppError(429, AUTH_ERRORS.tooManyAttempts, "Too many attempts");
          }
          throw invalid();
        }
      }
    }
    if (!link || link.consumedAt || link.expiresAt <= now) throw invalid();
    const consumed = link;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.magicLinkToken.updateMany({
        where: { id: consumed.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw invalid();
      const user = await this.accounts.upsertVerifiedByEmail(consumed.email, consumed.locale, tx);
      if (consumed.purpose === "salon_registration" && consumed.salonId) {
        const organizationId = await activatePendingOwner(tx, consumed.salonId, user.id);
        if (organizationId) {
          await this.audit.record(
            {
              action: "salon.owner_verified",
              actor: { type: "user", id: user.id },
              salonId: consumed.salonId,
              organizationId,
              targetType: "salon",
              targetId: consumed.salonId,
            },
            tx,
          );
        }
      }
      return { user, link: consumed };
    });
  }
}

/** Opening the registration link proves the email: pending owner memberships become active. */
async function activatePendingOwner(
  tx: Prisma.TransactionClient,
  salonId: string,
  userId: string,
): Promise<string | null> {
  const salon = await tx.salon.findUnique({
    where: { id: salonId },
    select: { organizationId: true },
  });
  if (!salon) return null;
  const activated = await tx.salonMember.updateMany({
    where: { salonId, userId, status: "pending_verification" },
    data: { status: "active" },
  });
  await tx.organizationMember.updateMany({
    where: { organizationId: salon.organizationId, userId, status: "pending_verification" },
    data: { status: "active" },
  });
  return activated.count > 0 ? salon.organizationId : null;
}
