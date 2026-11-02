import { Injectable, Logger } from "@nestjs/common";
import { type SalonEntitlements, salonEntitlementsSchema } from "@gugu/contracts";
import { RedisService } from "../../../infrastructure/redis/redis.service";
import type { EntitlementCache } from "../application/entitlement-cache";

const key = (salonId: string) => `entitlements:v1:${salonId}`;

/**
 * Redis-backed cache. Fails open to the database: a Redis error is logged and treated as a miss,
 * so entitlement checks never fail (or grant) because the cache is down.
 */
@Injectable()
export class RedisEntitlementCache implements EntitlementCache {
  private readonly logger = new Logger(RedisEntitlementCache.name);

  constructor(private readonly redis: RedisService) {}

  async get(salonId: string): Promise<SalonEntitlements | undefined> {
    try {
      const raw = await this.redis.client.get(key(salonId));
      if (raw === null) return undefined;
      const parsed = salonEntitlementsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch (e) {
      this.logger.warn({ err: e }, "entitlement cache read failed");
      return undefined;
    }
  }

  async set(salonId: string, value: SalonEntitlements, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(key(salonId), JSON.stringify(value), "EX", ttlSeconds);
    } catch (e) {
      this.logger.warn({ err: e }, "entitlement cache write failed");
    }
  }

  async delete(salonId: string): Promise<void> {
    try {
      await this.redis.client.del(key(salonId));
    } catch (e) {
      this.logger.warn({ err: e }, "entitlement cache invalidation failed");
    }
  }
}
