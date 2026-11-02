import { Injectable } from "@nestjs/common";
import {
  AUTH_ERRORS,
  type AuthClient,
  type AuthProviders,
  type MagicLinkVerifyInput,
  type SocialSignInInput,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import type { User } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { RateLimitService } from "../../../infrastructure/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.facade";
import type { RequestMeta } from "../infra/http-meta";
import { IdTokenVerifier } from "../infra/id-token-verifier";
import { AccountsService } from "./accounts.service";
import { MagicLinkService } from "./magic-link.service";
import { type IssuedSession, SessionService } from "./session.service";

export interface SignInResult {
  user: User;
  session: IssuedSession;
  redirectPath: string | null;
}

/** Turns a proof of identity (magic link or provider ID token) into a session + audit entry. */
@Injectable()
export class SignInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly magicLinks: MagicLinkService,
    private readonly sessions: SessionService,
    private readonly accounts: AccountsService,
    private readonly verifier: IdTokenVerifier,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  providers(): AuthProviders {
    return {
      emailMagicLink: true,
      google: this.config.googleClientIds.length > 0,
      apple: this.config.appleClientIds.length > 0,
      zalo: this.config.env.ZALO_LOGIN_ENABLED,
    };
  }

  async withMagicLink(input: MagicLinkVerifyInput, meta: RequestMeta): Promise<SignInResult> {
    const { user, link } = await this.magicLinks.verify(input, meta);
    const session = await this.start(user, input.client, meta, "magic_link");
    return { user, session, redirectPath: link.redirectPath };
  }

  async withProvider(input: SocialSignInInput, meta: RequestMeta): Promise<SignInResult> {
    await this.rateLimit.consume(
      { name: "auth.social.ip", limit: 30, windowSeconds: 900 },
      meta.ipPrefix ?? "none",
    );
    const audiences =
      input.provider === "google" ? this.config.googleClientIds : this.config.appleClientIds;
    if (audiences.length === 0) {
      throw new AppError(404, AUTH_ERRORS.providerDisabled, "Sign-in provider not enabled");
    }
    const claims = await this.verifier.verify(input.provider, input.idToken, audiences);
    if (!claims) throw new AppError(401, AUTH_ERRORS.providerTokenInvalid, "ID token invalid");

    const user = await this.prisma.$transaction(async (tx) => {
      const identity = await tx.authIdentity.findUnique({
        where: { provider_subject: { provider: input.provider, subject: claims.subject } },
        include: { user: true },
      });
      if (identity) {
        this.accounts.assertUsable(identity.user);
        return tx.user.update({
          where: { id: identity.userId },
          data: { lastLoginAt: new Date() },
        });
      }
      // R5: link to an existing account only when the provider has verified the email.
      if (!claims.email || !claims.emailVerified) {
        throw new AppError(401, AUTH_ERRORS.providerTokenInvalid, "Provider email not verified");
      }
      const account = await this.accounts.upsertVerifiedByEmail(claims.email, input.locale, tx);
      await tx.authIdentity.create({
        data: {
          userId: account.id,
          provider: input.provider,
          subject: claims.subject,
          email: claims.email,
        },
      });
      await this.audit.record(
        {
          action: "auth.identity_linked",
          actor: { type: "user", id: account.id },
          targetType: "user",
          targetId: account.id,
          metadata: { provider: input.provider },
        },
        tx,
      );
      return account;
    });
    const session = await this.start(user, input.client, meta, input.provider);
    return { user, session, redirectPath: null };
  }

  private async start(
    user: User,
    client: AuthClient,
    meta: RequestMeta,
    method: string,
  ): Promise<IssuedSession> {
    const session = await this.sessions.create(user.id, client, meta);
    await this.audit.record({
      action: "auth.sign_in",
      actor: { type: "user", id: user.id },
      targetType: "session",
      targetId: session.sessionId,
      metadata: { method, client },
      ipPrefix: meta.ipPrefix,
      userAgent: meta.userAgent,
    });
    return session;
  }
}
