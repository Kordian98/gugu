import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { RedisService } from "../../../infrastructure/redis/redis.service";
import type { CsMessage } from "../client/zalo-client";

/**
 * State of the built-in Zalo emulator, kept in Redis so the API and the worker process share it.
 * Dev/test only (ZALO_CLIENT=emulated, never in production). Keys: `zalo-emu:*`.
 */
const P = "zalo-emu:";
/** Emulated OA access tokens live 25 h, like Zalo's; refresh tokens 90 days ([3p]). */
export const EMU_ACCESS_TTL_MS = 25 * 3_600_000;
const REFRESH_TTL_S = 90 * 86_400;
const OUTBOX_MAX = 500;

export interface EmulatorFaults {
  /** Every access token is reported invalid (forces refresh / needs_reauth paths). */
  expireTokens?: boolean | undefined;
  /** Refresh fails permanently (→ needs_reauth). */
  refreshFails?: boolean | undefined;
  /** The next N sends fail with HTTP 503. */
  failNext?: number | undefined;
  /** Template sends fail with "quota exceeded". */
  quotaExceeded?: boolean | undefined;
  /** Template sends fail with "template not approved". */
  templateRejected?: boolean | undefined;
}

export interface OutboxEntry {
  id: string;
  at: string;
  oaId: string;
  channel: "cs" | "template";
  userId: string | null;
  phone: string | null;
  message: CsMessage | null;
  templateId: string | null;
  data: Record<string, string> | null;
}

export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const token = (prefix: string) => `${prefix}_${randomBytes(18).toString("base64url")}`;

@Injectable()
export class EmulatorStore {
  constructor(private readonly redis: RedisService) {}

  private get r() {
    return this.redis.client;
  }

  /** Webhook target override (tests listen on a random port). Static: one per process. */
  static webhookUrl: string | null = null;

  async saveOa(oaId: string, name: string): Promise<void> {
    await this.r.hset(`${P}oas`, oaId, name);
  }

  async oas(): Promise<Record<string, string>> {
    return this.r.hgetall(`${P}oas`);
  }

  async createCode(oaId: string, codeChallenge: string): Promise<string> {
    const code = token("code");
    await this.r.set(`${P}code:${code}`, JSON.stringify({ oaId, codeChallenge }), "EX", 600);
    return code;
  }

  async consumeCode(code: string): Promise<{ oaId: string; codeChallenge: string } | null> {
    const raw = await this.r.getdel(`${P}code:${code}`);
    return raw ? (JSON.parse(raw) as { oaId: string; codeChallenge: string }) : null;
  }

  async issueTokens(oaId: string, now: Date) {
    const accessToken = token("at");
    const refreshToken = token("rt");
    const expiresAt = new Date(now.getTime() + EMU_ACCESS_TTL_MS);
    await this.r.set(
      `${P}at:${accessToken}`,
      JSON.stringify({ oaId, exp: expiresAt.getTime() }),
      "PX",
      EMU_ACCESS_TTL_MS,
    );
    await this.r.set(`${P}rt:${refreshToken}`, oaId, "EX", REFRESH_TTL_S);
    return { accessToken, refreshToken, expiresAt };
  }

  /** Refresh tokens are single-use (rotated), like Zalo's. */
  async consumeRefresh(refreshToken: string): Promise<string | null> {
    return this.r.getdel(`${P}rt:${refreshToken}`);
  }

  async oaForToken(accessToken: string, now: Date): Promise<string | null> {
    const raw = await this.r.get(`${P}at:${accessToken}`);
    if (!raw) return null;
    const { oaId, exp } = JSON.parse(raw) as { oaId: string; exp: number };
    return exp > now.getTime() ? oaId : null;
  }

  async faults(oaId: string): Promise<EmulatorFaults> {
    const raw = await this.r.get(`${P}faults:${oaId}`);
    return raw ? (JSON.parse(raw) as EmulatorFaults) : {};
  }

  async setFaults(oaId: string, faults: EmulatorFaults): Promise<void> {
    await this.r.set(`${P}faults:${oaId}`, JSON.stringify(faults));
  }

  /** Consumes one "failNext" unit; true when this call should fail. */
  async takeFailure(oaId: string): Promise<boolean> {
    const faults = await this.faults(oaId);
    if (!faults.failNext) return false;
    await this.setFaults(oaId, { ...faults, failNext: faults.failNext - 1 });
    return true;
  }

  async touch(oaId: string, userId: string, at: Date, name?: string): Promise<void> {
    await this.r.hset(`${P}int:${oaId}`, userId, String(at.getTime()));
    if (name) await this.r.hset(`${P}names:${oaId}`, userId, name);
  }

  async userName(oaId: string, userId: string): Promise<string | null> {
    return this.r.hget(`${P}names:${oaId}`, userId);
  }

  async lastInteraction(oaId: string, userId: string): Promise<Date | null> {
    const ms = await this.r.hget(`${P}int:${oaId}`, userId);
    return ms ? new Date(Number(ms)) : null;
  }

  async users(
    oaId: string,
  ): Promise<{ userId: string; name: string | null; lastInteractionAt: string }[]> {
    const [ints, names] = await Promise.all([
      this.r.hgetall(`${P}int:${oaId}`),
      this.r.hgetall(`${P}names:${oaId}`),
    ]);
    return Object.entries(ints).map(([userId, ms]) => ({
      userId,
      name: names[userId] ?? null,
      lastInteractionAt: new Date(Number(ms)).toISOString(),
    }));
  }

  async record(entry: Omit<OutboxEntry, "id">): Promise<OutboxEntry> {
    const full = { ...entry, id: token("msg") };
    await this.r.lpush(`${P}outbox:${entry.oaId}`, JSON.stringify(full));
    await this.r.ltrim(`${P}outbox:${entry.oaId}`, 0, OUTBOX_MAX - 1);
    return full;
  }

  /** Newest last. */
  async outbox(oaId: string, userId?: string): Promise<OutboxEntry[]> {
    const raw = await this.r.lrange(`${P}outbox:${oaId}`, 0, OUTBOX_MAX - 1);
    const all = raw.map((r) => JSON.parse(r) as OutboxEntry).reverse();
    return userId ? all.filter((e) => e.userId === userId || e.channel === "template") : all;
  }

  async clear(oaId: string): Promise<void> {
    await this.r.del(
      `${P}outbox:${oaId}`,
      `${P}int:${oaId}`,
      `${P}names:${oaId}`,
      `${P}faults:${oaId}`,
    );
  }
}

export const EMULATOR_APP_ID = "gugu-emulator-app";
