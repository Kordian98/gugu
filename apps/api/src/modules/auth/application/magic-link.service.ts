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

/** Per-email limits, keyed on the email HMAC. Enforced in `issue()` so every caller is covered. */
export const MAGIC_LINK_LIMITS = {
  email: { name: "auth.magic_link.email", limit: 3, windowSeconds: 900 },
  emailDay: { name: "auth.magic_link.email_day", limit: 10, windowSeconds: 86_400 },
  /** Rolling cap on wrong codes across all links of one email (not only per link). */
  codeFailures: { name: "auth.verify.code_fail.email", limit: 10, windowSeconds: 3_600 },
} as const;

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
    await this.rateLimit.consume(
      { name: "auth.magic_link.ip", limit: 30, windowSeconds: 900 },
      meta.ipPrefix ?? "none",
    );
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { status: true },
    });
    if (user && (user.status === "suspended" || user.status === "deleted")) {
      // Count the attempt anyway so the response pattern doesn't reveal account status.
      await this.consumeEmailLimits(input.email);
      return;
    }
    await this.issue({ ...input, redirectPath: input.redirectPath ?? null }, meta);
  }

  private async consumeEmailLimits(email: string): Promise<void> {
    const subject = this.hash("subject", email);
    await this.rateLimit.consume(MAGIC_LINK_LIMITS.email, subject);
    await this.rateLimit.consume(MAGIC_LINK_LIMITS.emailDay, subject);
  }

  /**
   * Creates a link and emails it. Every caller (sign-in request, salon registration via the auth
   * facade) goes through the per-email limits here; throws 429 `common.rate_limited` when exceeded.
   */
  async issue(
    input: IssueMagicLink,
    meta: RequestMeta,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.consumeEmailLimits(input.email);
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
      const subject = this.hash("subject", input.email);
      const tooMany = () => new AppError(429, AUTH_ERRORS.tooManyAttempts, "Too many attempts");
      // Rolling cap across all links of this email: checked before any comparison.
      if (await this.rateLimit.exceeded(MAGIC_LINK_LIMITS.codeFailures, subject)) throw tooMany();
      if (link) {
        const ok = safeEqual(link.codeHash, this.hash("code", `${input.email}:${input.code}`));
        if (!ok) {
          await this.rateLimit.consume(MAGIC_LINK_LIMITS.codeFailures, subject).catch(() => {
            // Reaching the cap on this attempt still answers with the per-attempt result below.
          });
          // Atomic increment: parallel guesses can't exceed MAX_CODE_ATTEMPTS on one link.
          const counted = await this.prisma.magicLinkToken.updateMany({
            where: { id: link.id, consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
            data: { attempts: { increment: 1 } },
          });
          const after = await this.prisma.magicLinkToken.findUniqueOrThrow({
            where: { id: link.id },
            select: { attempts: true },
          });
          if (counted.count === 0 || after.attempts >= MAX_CODE_ATTEMPTS) {
            await this.prisma.magicLinkToken.updateMany({
              where: { id: link.id, consumedAt: null },
              data: { consumedAt: now },
            });
            throw tooMany();
          }
          throw invalid();
        }
      } else {
        // No live link: still count the guess so probing an email without links is capped too.
        await this.rateLimit
          .consume(MAGIC_LINK_LIMITS.codeFailures, subject)
          .catch(() => undefined);
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
      // Any proof of the email (sign-in or registration link) activates memberships that were
      // waiting for it — so a rate-limited registration email can be replaced by a normal sign-in.
      for (const pending of await activatePendingMemberships(tx, user.id)) {
        await this.audit.record(
          {
            action: "salon.owner_verified",
            actor: { type: "user", id: user.id },
            salonId: pending.salonId,
            organizationId: pending.organizationId,
            targetType: "salon",
            targetId: pending.salonId,
          },
          tx,
        );
      }
      return { user, link: consumed };
    });
  }
}

/** Proving the email activates the user's `pending_verification` salon and org memberships. */
async function activatePendingMemberships(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ salonId: string; organizationId: string }[]> {
  const pending = await tx.salonMember.findMany({
    where: { userId, status: "pending_verification" },
    select: { salonId: true, salon: { select: { organizationId: true } } },
  });
  if (pending.length === 0) return [];
  await tx.salonMember.updateMany({
    where: { userId, status: "pending_verification" },
    data: { status: "active" },
  });
  await tx.organizationMember.updateMany({
    where: { userId, status: "pending_verification" },
    data: { status: "active" },
  });
  return pending.map((p) => ({ salonId: p.salonId, organizationId: p.salon.organizationId }));
}
