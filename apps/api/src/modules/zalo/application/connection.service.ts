import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ZALO_ERRORS, type ZaloConnection, type ZaloSettingsInput } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
import type { ZaloOaConnection } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../../infrastructure/redis/redis.service";
import { AuditService } from "../../audit/audit.facade";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";
import { ZALO_CLIENT, ZaloApiError, type ZaloClient } from "../client/zalo-client";
import { s256 } from "../emulator/emulator-store";
import { TokenCipher } from "../infra/token-cipher";
import { UsageQueries } from "./usage.queries";
import { ZaloClock } from "./zalo-clock";

const STATE_TTL_S = 600;
/** Refresh a little before Zalo's expiry so in-flight sends never carry a dead token. */
const REFRESH_MARGIN_MS = 10 * 60_000;
const LOCK_TTL_MS = 30_000;

export const ZALO_CALLBACK_PATH = "/api/v1/integrations/zalo/oauth/callback";

interface OAuthState {
  salonId: string;
  userId: string;
  verifier: string;
  locale: "vi" | "en";
}

/**
 * Salon ↔ OA connection (X24): OAuth v4 + PKCE, encrypted per-salon tokens, single-flight refresh
 * (Zalo refresh tokens are single-use), status, reconnect, disconnect (stops all messaging).
 */
@Injectable()
export class ConnectionService {
  private readonly logger = new Logger(ConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    private readonly cipher: TokenCipher,
    private readonly clock: ZaloClock,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
    private readonly usage: UsageQueries,
    @Inject(ZALO_CLIENT) private readonly client: ZaloClient,
  ) {}

  private assertEnabled(): void {
    if (this.client.mode === "disabled") {
      throw new AppError(503, ZALO_ERRORS.disabled, "Zalo integration is not enabled");
    }
  }

  async status(salonId: string): Promise<ZaloConnection> {
    const [conn, usage, unread] = await Promise.all([
      this.prisma.zaloOaConnection.findUnique({ where: { salonId } }),
      this.usage.month(salonId),
      this.prisma.zaloStaffNotification.count({ where: { salonId, readAt: null } }),
    ]);
    const templateIds = (conn?.templateIds ?? {}) as ZaloConnection["templateIds"];
    return {
      mode: this.client.mode,
      status: conn ? conn.status : "not_connected",
      oaId: conn?.status === "disconnected" ? null : (conn?.oaId ?? null),
      oaName: conn?.status === "disconnected" ? null : (conn?.oaName ?? null),
      connectedAt:
        conn?.status === "disconnected" ? null : (conn?.connectedAt.toISOString() ?? null),
      lastError: conn?.lastError ?? null,
      botEnabled: conn?.botEnabled ?? true,
      reminder24h: conn?.reminder24h ?? true,
      reminder2h: conn?.reminder2h ?? true,
      allowPaidMessages: conn?.allowPaidMessages ?? true,
      monthlyTemplateCap: conn?.monthlyTemplateCap ?? null,
      templateIds,
      usage,
      unreadNotifications: unread,
    };
  }

  async start(
    salonId: string,
    userId: string,
    locale: "vi" | "en",
  ): Promise<{ authorizeUrl: string }> {
    this.assertEnabled();
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const payload: OAuthState = { salonId, userId, verifier, locale };
    await this.redis.client.set(`zalo:oauth:${state}`, JSON.stringify(payload), "EX", STATE_TTL_S);
    return {
      authorizeUrl: this.client.authorizeUrl({
        state,
        codeChallenge: s256(verifier),
        redirectUri: this.callbackUrl(),
      }),
    };
  }

  callbackUrl(): string {
    return `${this.config.env.API_PUBLIC_URL}${ZALO_CALLBACK_PATH}`;
  }

  private returnUrl(locale: "vi" | "en", result: string): string {
    return `${this.config.env.WEB_APP_URL}/${locale}/business/settings?section=zalo&zalo=${result}`;
  }

  /** OAuth redirect target. Returns where to send the browser next (the panel, with a result). */
  async callback(input: {
    code?: string | undefined;
    state?: string | undefined;
  }): Promise<string> {
    const raw = input.state ? await this.redis.client.getdel(`zalo:oauth:${input.state}`) : null;
    if (!raw) return this.returnUrl("vi", "expired");
    const state = JSON.parse(raw) as OAuthState;
    if (!input.code) return this.returnUrl(state.locale, "denied");
    try {
      const tokens = await this.client.exchangeCode({
        code: input.code,
        codeVerifier: state.verifier,
      });
      const oa = await this.client.getOa(tokens.accessToken);
      if (!(await this.entitlements.isEnabled(state.salonId, "zalo.oa_connect"))) {
        return this.returnUrl(state.locale, "plan");
      }
      const data = {
        oaId: oa.oaId,
        oaName: oa.name,
        status: "connected" as const,
        accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
        refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
        accessExpiresAt: tokens.expiresAt,
        connectedByUserId: state.userId,
        connectedAt: this.clock.now(),
        disconnectedAt: null,
        lastRefreshAt: this.clock.now(),
        lastError: null,
      };
      await this.prisma.$transaction(async (tx) => {
        const saved = await tx.zaloOaConnection.upsert({
          where: { salonId: state.salonId },
          create: { salonId: state.salonId, ...data },
          update: data,
          select: { id: true },
        });
        await this.audit.record(
          {
            action: "zalo.oa_connected",
            actor: { type: "user", id: state.userId },
            salonId: state.salonId,
            targetType: "zalo_connection",
            targetId: saved.id,
            metadata: { oaId: oa.oaId },
          },
          tx,
        );
      });
      return this.returnUrl(state.locale, "connected");
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.returnUrl(state.locale, "oa_in_use");
      }
      this.logger.warn(
        { salonId: state.salonId, err: (error as Error).message },
        "zalo oauth failed",
      );
      return this.returnUrl(state.locale, "failed");
    }
  }

  async disconnect(salonId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.zaloOaConnection.updateMany({
        where: { salonId, status: { not: "disconnected" } },
        data: {
          status: "disconnected",
          accessTokenEnc: null,
          refreshTokenEnc: null,
          accessExpiresAt: null,
          disconnectedAt: this.clock.now(),
        },
      });
      if (updated.count === 0) {
        throw new AppError(404, ZALO_ERRORS.notConnected, "No Zalo OA is connected");
      }
      // Queued sends are dropped: a disconnected salon sends nothing (X24).
      await tx.zaloSendLog.updateMany({
        where: { salonId, status: "queued" },
        data: { status: "rejected", errorCode: "disconnected", request: {} },
      });
      await this.audit.record(
        {
          action: "zalo.oa_disconnected",
          actor: { type: "user", id: userId },
          salonId,
          targetType: "zalo_connection",
        },
        tx,
      );
    });
  }

  async updateSettings(salonId: string, userId: string, input: ZaloSettingsInput): Promise<void> {
    const conn = await this.prisma.zaloOaConnection.findUnique({ where: { salonId } });
    if (!conn || conn.status === "disconnected") {
      throw new AppError(404, ZALO_ERRORS.notConnected, "No Zalo OA is connected");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.zaloOaConnection.update({
        where: { salonId },
        data: {
          ...(input.botEnabled !== undefined ? { botEnabled: input.botEnabled } : {}),
          ...(input.reminder24h !== undefined ? { reminder24h: input.reminder24h } : {}),
          ...(input.reminder2h !== undefined ? { reminder2h: input.reminder2h } : {}),
          ...(input.allowPaidMessages !== undefined
            ? { allowPaidMessages: input.allowPaidMessages }
            : {}),
          ...(input.monthlyTemplateCap !== undefined
            ? { monthlyTemplateCap: input.monthlyTemplateCap }
            : {}),
          ...(input.templateIds !== undefined ? { templateIds: input.templateIds } : {}),
        },
      });
      await this.audit.record(
        {
          action: "zalo.settings_updated",
          actor: { type: "user", id: userId },
          salonId,
          targetType: "zalo_connection",
          targetId: conn.id,
          metadata: { fields: Object.keys(input).join(",") },
        },
        tx,
      );
    });
  }

  /**
   * A usable access token for a connected salon, refreshing it first when close to expiry. Returns
   * null when the salon is not connected (or just moved to needs_reauth).
   */
  async accessToken(salonId: string, opts: { force?: boolean } = {}): Promise<string | null> {
    const conn = await this.prisma.zaloOaConnection.findUnique({ where: { salonId } });
    if (conn?.status !== "connected" || !conn.accessTokenEnc) return null;
    const due =
      opts.force ||
      !conn.accessExpiresAt ||
      conn.accessExpiresAt.getTime() - this.clock.now().getTime() < REFRESH_MARGIN_MS;
    if (!due) return this.cipher.decrypt(conn.accessTokenEnc);
    return this.refresh(conn);
  }

  /** Single-flight refresh across processes (refresh tokens are single-use). */
  private async refresh(conn: ZaloOaConnection): Promise<string | null> {
    const lockKey = `zalo:refresh-lock:${conn.salonId}`;
    const lock = randomBytes(8).toString("hex");
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await this.redis.client.set(lockKey, lock, "PX", LOCK_TTL_MS, "NX")) break;
      await new Promise((r) => setTimeout(r, 250));
      const fresh = await this.prisma.zaloOaConnection.findUnique({
        where: { salonId: conn.salonId },
      });
      if (fresh?.status !== "connected") return null;
      if (
        fresh.lastRefreshAt &&
        conn.lastRefreshAt &&
        fresh.lastRefreshAt > conn.lastRefreshAt &&
        fresh.accessTokenEnc
      ) {
        return this.cipher.decrypt(fresh.accessTokenEnc);
      }
    }
    try {
      const current = await this.prisma.zaloOaConnection.findUnique({
        where: { salonId: conn.salonId },
      });
      if (current?.status !== "connected" || !current.refreshTokenEnc) return null;
      if (
        current.lastRefreshAt &&
        conn.lastRefreshAt &&
        current.lastRefreshAt > conn.lastRefreshAt &&
        current.accessTokenEnc
      ) {
        return this.cipher.decrypt(current.accessTokenEnc);
      }
      const tokens = await this.client.refresh(this.cipher.decrypt(current.refreshTokenEnc));
      await this.prisma.zaloOaConnection.updateMany({
        where: { salonId: conn.salonId, status: "connected" },
        data: {
          accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
          refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
          accessExpiresAt: tokens.expiresAt,
          lastRefreshAt: this.clock.now(),
          lastError: null,
        },
      });
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof ZaloApiError && !error.retryable) {
        await this.markNeedsReauth(conn.salonId, error.message);
        return null;
      }
      throw error;
    } finally {
      if ((await this.redis.client.get(lockKey)) === lock) await this.redis.client.del(lockKey);
    }
  }

  async markNeedsReauth(salonId: string, reason: string): Promise<void> {
    const updated = await this.prisma.zaloOaConnection.updateMany({
      where: { salonId, status: "connected" },
      data: { status: "needs_reauth", lastError: reason.slice(0, 200) },
    });
    if (updated.count === 1) {
      await this.prisma.zaloStaffNotification.create({
        data: { salonId, kind: "connection_needs_reauth" },
      });
      this.logger.warn({ salonId }, "zalo connection needs reauth");
    }
  }

  /** Periodic job: refresh tokens expiring within the next hour. */
  async refreshDue(): Promise<{ refreshed: number }> {
    const soon = new Date(this.clock.now().getTime() + 3_600_000);
    const due = await this.prisma.zaloOaConnection.findMany({
      where: { status: "connected", accessExpiresAt: { lt: soon } },
      select: { salonId: true },
      take: 200,
    });
    let refreshed = 0;
    for (const { salonId } of due) {
      if (await this.accessToken(salonId, { force: true }).catch(() => null)) refreshed += 1;
    }
    return { refreshed };
  }
}
