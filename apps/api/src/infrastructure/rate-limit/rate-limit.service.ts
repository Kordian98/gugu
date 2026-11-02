import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/problem/app-error";
import { COMMON_ERRORS } from "../../common/problem/error-codes";
import { RedisService } from "../redis/redis.service";

export interface RateLimitRule {
  /** Stable bucket name, e.g. `auth.magic_link.email`. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Fixed-window counters in Valkey (spec 05 R32). Keys never contain raw personal data: callers pass
 * an already-hashed subject (email/phone) or an IP prefix.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Counts one hit; throws 429 `common.rate_limited` once the window's limit is exceeded. */
  async consume(rule: RateLimitRule, subject: string): Promise<void> {
    const key = `rl:${rule.name}:${subject}`;
    const results = await this.redis.client
      .multi()
      .incr(key)
      .expire(key, rule.windowSeconds, "NX")
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    if (count > rule.limit) {
      throw new AppError(429, COMMON_ERRORS.rateLimited, "Too many requests", {
        detail: `retry within ${String(rule.windowSeconds)}s`,
      });
    }
  }
}
