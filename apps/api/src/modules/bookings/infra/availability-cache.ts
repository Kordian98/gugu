import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../../infrastructure/redis/redis.service";

/**
 * Read-through cache for availability responses (spec 06 G19, M6.7). Advisory only: every write
 * revalidates inside its transaction, so a stale entry can at worst offer a slot that then returns
 * `409 booking.slot_taken` — it can never cause a double booking.
 *
 * Key = salon + `salon_settings.availability_version` (bumped by every hours/schedule/catalog/
 * resource change, in the same transaction) + a per-salon occupancy counter in Valkey (bumped after
 * every booking/hold commit) + the current minute (lead time and expiring holds move with the
 * clock) + the query. A changed part means a new key; old entries expire on their own (TTL).
 * Valkey errors fail open: the request is computed without the cache.
 */
@Injectable()
export class AvailabilityCache {
  private readonly logger = new Logger(AvailabilityCache.name);
  static readonly TTL_SECONDS = 90;
  static readonly OCCUPANCY_TTL_SECONDS = 7 * 24 * 3600;

  constructor(private readonly redis: RedisService) {}

  private occKey(salonId: string): string {
    return `avail:occ:${salonId}`;
  }

  /** Call after a transaction that changed occupancy (booking, hold, cancel, reschedule) commits. */
  async bumpOccupancy(salonId: string): Promise<void> {
    try {
      await this.redis.client
        .multi()
        .incr(this.occKey(salonId))
        .expire(this.occKey(salonId), AvailabilityCache.OCCUPANCY_TTL_SECONDS)
        .exec();
    } catch (error) {
      this.logger.warn({ salonId, err: (error as Error).message }, "occupancy bump failed");
    }
  }

  async getOrCompute<T>(
    scope: { salonId: string; availabilityVersion: number; now: Date; kind: string },
    params: unknown,
    compute: () => Promise<T>,
  ): Promise<T> {
    let key: string | null = null;
    try {
      const occ = (await this.redis.client.get(this.occKey(scope.salonId))) ?? "0";
      const minute = Math.floor(scope.now.getTime() / 60_000);
      const query = createHash("sha256").update(JSON.stringify(params)).digest("base64url");
      key = `avail:v1:${scope.salonId}:${String(scope.availabilityVersion)}:${occ}:${String(minute)}:${scope.kind}:${query}`;
      const hit = await this.redis.client.get(key);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, "availability cache read failed");
      key = null;
    }
    const value = await compute();
    if (key) {
      try {
        await this.redis.client.set(
          key,
          JSON.stringify(value),
          "EX",
          AvailabilityCache.TTL_SECONDS,
        );
      } catch (error) {
        this.logger.warn({ err: (error as Error).message }, "availability cache write failed");
      }
    }
    return value;
  }
}
