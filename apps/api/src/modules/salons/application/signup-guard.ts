import { Injectable, Logger } from "@nestjs/common";
import { getDomain } from "tldts";
import { SALON_ERRORS } from "@gugu/contracts";
import { emailDomain, isDisposableEmail, isMajorEmailProvider } from "@gugu/domain";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import {
  type RateLimitRule,
  RateLimitService,
} from "../../../infrastructure/rate-limit/rate-limit.service";
import type { RequestMeta } from "../../auth/auth.facade";

type Tx = Prisma.TransactionClient;

/** Share of the global cap at which an error is logged before anyone is refused. */
export const GLOBAL_CAP_ALERT_RATIO = 0.8;

/**
 * Registrable domain (eTLD+1, ICANN section of the Public Suffix List via `tldts`) of a host:
 * `a.evil.com` and `b.c.evil.com` → `evil.com`; `mail.shop.com.vn` → `shop.com.vn`; `x.vn` → `x.vn`.
 * Private-section suffixes (e.g. dynamic-DNS zones) are deliberately not honoured, so all of their
 * subdomains share one bucket. Falls back to the lower-cased host when there is no registrable
 * domain (a bare public suffix, an IP literal).
 */
export function registrableDomain(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return getDomain(h, { allowPrivateDomains: false }) ?? h;
}

export interface SignupLimitConfig {
  QUICK_START_DAILY_CAP: number;
  QUICK_START_DOMAIN_DAILY_LIMIT: number;
  QUICK_START_IP_DAILY_LIMIT: number;
  QUICK_START_SOURCE_SHARE_PCT: number;
}

export interface SignupBucket {
  rule: RateLimitRule;
  subject: string;
}

const DAY = 86_400;

/**
 * Every bucket one salon-creating signup consumes, in order (global last, so a refusal by any
 * sub-cap never counts against the global cap). Every other bucket is at most the source share of
 * the global cap, so one registrable domain (gmail.com included) or one IP /24 cannot exhaust it.
 */
export function signupBuckets(
  env: SignupLimitConfig,
  input: { userId: string; email: string; ipPrefix: string | null },
): SignupBucket[] {
  const cap = env.QUICK_START_DAILY_CAP;
  const share = Math.max(1, Math.floor((cap * env.QUICK_START_SOURCE_SHARE_PCT) / 100));
  // Never one shared bucket for every request without a known client IP.
  const ip = input.ipPrefix ?? `user:${input.userId}`;
  const buckets: SignupBucket[] = [
    {
      rule: { name: "salons.quick_start.user", limit: Math.min(5, share), windowSeconds: DAY },
      subject: input.userId,
    },
    {
      rule: { name: "salons.quick_start.ip", limit: Math.min(20, share), windowSeconds: 3600 },
      subject: ip,
    },
    {
      rule: {
        name: "salons.quick_start.ip_daily",
        limit: Math.min(env.QUICK_START_IP_DAILY_LIMIT, share),
        windowSeconds: DAY,
      },
      subject: ip,
    },
  ];
  const host = emailDomain(input.email);
  if (host) {
    // Large consumer providers skip the per-domain limit but still get only the source share.
    const limit = isMajorEmailProvider(input.email)
      ? share
      : Math.min(env.QUICK_START_DOMAIN_DAILY_LIMIT, share);
    buckets.push({
      rule: { name: "salons.quick_start.domain", limit, windowSeconds: DAY },
      subject: registrableDomain(host),
    });
  }
  buckets.push({
    rule: { name: "salons.quick_start.global", limit: cap, windowSeconds: DAY },
    subject: "all",
  });
  return buckets;
}

/**
 * The single gate for every path that creates a salon (and with it a trial + free Basic year) for
 * a signed-in user (ADR-0018, security review of the reg-flow merge). Any new salon-creating
 * command MUST call all three steps; `POST /salons/registrations` was removed rather than given a
 * second copy of these rules.
 */
@Injectable()
export class SignupGuard {
  private readonly logger = new Logger(SignupGuard.name);

  constructor(
    private readonly config: AppConfig,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Platform admins own no salon (403). */
  assertPrincipal(user: UserPrincipal): void {
    if (user.platformRole !== null) {
      throw new AppError(403, SALON_ERRORS.quickStartNotAllowed, "Platform admins own no salon");
    }
  }

  /**
   * Inside the creating transaction: a team invitation for this email refuses with 409 unless the
   * user chose "create my own salon" (q102); disposable email domains refuse with 422.
   */
  async assertEligible(
    tx: Tx,
    input: { userId: string; email: string; ignoreInvitations: boolean },
  ): Promise<void> {
    if (!input.ignoreInvitations && (await this.hasInvitation(tx, input.userId, input.email))) {
      throw new AppError(409, SALON_ERRORS.invitationPending, "A team invitation exists");
    }
    if (isDisposableEmail(input.email)) {
      throw new AppError(422, SALON_ERRORS.emailNotAllowed, "Disposable email domain");
    }
  }

  /**
   * Consumes every abuse bucket (only when a salon is about to be created). A refusal gives back
   * the hits already counted for this attempt, so refused attempts never eat other sources' room.
   * Logs an error once the global cap is near, and on every refusal by it.
   */
  async consume(userId: string, email: string, meta: RequestMeta): Promise<void> {
    const env = this.config.env;
    const consumed: SignupBucket[] = [];
    for (const bucket of signupBuckets(env, { userId, email, ipPrefix: meta.ipPrefix })) {
      let count: number;
      try {
        count = await this.rateLimit.consume(bucket.rule, bucket.subject);
      } catch (err) {
        // The refusing bucket counted its hit too; give it back as well.
        for (const b of [...consumed, bucket]) await this.rateLimit.refund(b.rule, b.subject);
        if (bucket.subject === "all" && err instanceof AppError && err.status === 429) {
          // Alert: either real growth (raise QUICK_START_DAILY_CAP) or trial farming.
          this.logger.error({ cap: bucket.rule.limit }, "quick-start global daily cap reached");
        }
        throw err;
      }
      consumed.push(bucket);
      if (bucket.subject === "all") {
        const alertAt = Math.ceil(bucket.rule.limit * GLOBAL_CAP_ALERT_RATIO);
        if (count === alertAt) {
          this.logger.error(
            { cap: bucket.rule.limit, count },
            "quick-start global daily cap nearly reached",
          );
        }
      }
    }
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
}
