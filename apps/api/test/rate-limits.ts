import type { INestApplication } from "@nestjs/common";
import { RedisService } from "../src/infrastructure/redis/redis.service";

/** Clears rate-limit counters (`rl:*`) so repeated local runs don't hit 429s. */
export async function clearRateLimits(app: INestApplication): Promise<void> {
  const redis = app.get(RedisService).client;
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rl:*", "COUNT", 500);
    if (keys.length) await redis.del(...keys);
    cursor = next;
  } while (cursor !== "0");
}
