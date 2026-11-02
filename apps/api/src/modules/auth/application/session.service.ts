import { Injectable } from "@nestjs/common";
import { AUTH_ERRORS, type NativeTokens } from "@gugu/contracts";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { type RequestMeta, WEB_SESSION_TTL_MS } from "../infra/http-meta";
import { randomToken, tokenHash } from "../infra/tokens";

const ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;
/** Slide the web session (and touch last_seen_at) at most once per hour. */
const SLIDE_AFTER_MS = 60 * 60 * 1000;

export type IssuedSession =
  | { kind: "web"; sessionId: string; cookieSecret: string; csrfToken: string }
  | { kind: "native"; sessionId: string; tokens: NativeTokens };

export interface AuthenticatedSession {
  principal: UserPrincipal;
  /** Set when a web session slid: re-send the cookie so the browser keeps it. */
  refreshedCookie: boolean;
}

/**
 * Sessions (spec 05 §3.2). One row per sign-in. Web: opaque cookie secret. Native: opaque 15-min
 * access token + rotating refresh token; presenting a used refresh token revokes the session.
 * Only HMACs of secrets are stored. Access tokens are opaque rather than JWTs because every request
 * already checks the session and membership in the database (R13: revocation takes effect at once).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private hash(purpose: "session" | "access" | "refresh", value: string): string {
    return tokenHash(this.config.env.AUTH_SECRET, purpose, value);
  }

  /** CSRF token for a web session: derived, so nothing extra is stored (double-submit via header). */
  csrfToken(sessionId: string): string {
    return tokenHash(this.config.env.AUTH_SECRET, "csrf", sessionId);
  }

  async create(
    userId: string,
    kind: "web" | "native",
    meta: RequestMeta,
    tx?: Prisma.TransactionClient,
  ): Promise<IssuedSession> {
    const db = tx ?? this.prisma;
    const now = Date.now();
    const expiresAt = new Date(now + ABSOLUTE_TTL_MS);
    const secret = randomToken();
    if (kind === "web") {
      const session = await db.session.create({
        data: {
          userId,
          kind,
          tokenHash: this.hash("session", secret),
          tokenExpiresAt: new Date(now + WEB_SESSION_TTL_MS),
          expiresAt,
          ipPrefix: meta.ipPrefix,
          userAgent: meta.userAgent,
        },
      });
      return {
        kind,
        sessionId: session.id,
        cookieSecret: secret,
        csrfToken: this.csrfToken(session.id),
      };
    }
    const accessExpiresAt = new Date(now + ACCESS_TTL_MS);
    const refresh = randomToken();
    const session = await db.session.create({
      data: {
        userId,
        kind,
        tokenHash: this.hash("access", secret),
        tokenExpiresAt: accessExpiresAt,
        expiresAt,
        ipPrefix: meta.ipPrefix,
        userAgent: meta.userAgent,
        refreshTokens: { create: { tokenHash: this.hash("refresh", refresh), expiresAt } },
      },
    });
    return {
      kind,
      sessionId: session.id,
      tokens: {
        accessToken: secret,
        accessTokenExpiresAt: accessExpiresAt.toISOString(),
        refreshToken: refresh,
      },
    };
  }

  /** Resolves a web cookie secret or a native bearer token; null when unknown/expired/revoked. */
  async authenticate(kind: "web" | "native", secret: string): Promise<AuthenticatedSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(kind === "web" ? "session" : "access", secret) },
      include: { user: { select: { status: true, platformRole: true } } },
    });
    const now = Date.now();
    if (
      !session ||
      session.kind !== kind ||
      session.revokedAt ||
      session.tokenExpiresAt.getTime() <= now ||
      session.expiresAt.getTime() <= now ||
      (session.user.status !== "active" && session.user.status !== "pending_deletion")
    ) {
      return null;
    }
    let refreshedCookie = false;
    if (now - session.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
      const data: Prisma.SessionUpdateInput = { lastSeenAt: new Date(now) };
      if (kind === "web") {
        data.tokenExpiresAt = new Date(
          Math.min(now + WEB_SESSION_TTL_MS, session.expiresAt.getTime()),
        );
        refreshedCookie = true;
      }
      await this.prisma.session.update({ where: { id: session.id }, data });
    }
    return {
      principal: {
        kind: "user",
        userId: session.userId,
        sessionId: session.id,
        sessionKind: kind,
        platformRole: session.user.platformRole,
      },
      refreshedCookie,
    };
  }

  /** Rotates a native refresh token. Reuse of a spent token revokes the whole session (G4). */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<NativeTokens> {
    const invalid = () => new AppError(401, AUTH_ERRORS.refreshInvalid, "Refresh token invalid");
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash("refresh", refreshToken) },
      include: { session: true },
    });
    if (!record) throw invalid();
    const { session } = record;
    const now = Date.now();
    if (record.usedAt) {
      await this.revokeForReuse(session.id, session.userId, meta);
      throw invalid();
    }
    if (
      session.revokedAt ||
      session.expiresAt.getTime() <= now ||
      record.expiresAt.getTime() <= now
    ) {
      throw invalid();
    }
    const access = randomToken();
    const nextRefresh = randomToken();
    const accessExpiresAt = new Date(now + ACCESS_TTL_MS);
    const rotated = await this.prisma.$transaction(async (tx) => {
      const spent = await tx.refreshToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date(now) },
      });
      if (spent.count !== 1) return false; // lost a race with a parallel refresh: treat as reuse
      await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: this.hash("refresh", nextRefresh),
          expiresAt: session.expiresAt,
        },
      });
      await tx.session.update({
        where: { id: session.id },
        data: {
          tokenHash: this.hash("access", access),
          tokenExpiresAt: accessExpiresAt,
          lastSeenAt: new Date(now),
        },
      });
      return true;
    });
    if (!rotated) {
      await this.revokeForReuse(session.id, session.userId, meta);
      throw invalid();
    }
    return {
      accessToken: access,
      accessTokenExpiresAt: accessExpiresAt.toISOString(),
      refreshToken: nextRefresh,
    };
  }

  private async revokeForReuse(
    sessionId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "refresh_reuse" },
    });
    await this.audit.record({
      action: "auth.session_reuse_detected",
      actor: { type: "user", id: userId },
      targetType: "session",
      targetId: sessionId,
      ipPrefix: meta.ipPrefix,
      userAgent: meta.userAgent,
    });
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return result.count;
  }
}
