import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { AppConfig } from "../config/app-config";

/**
 * Shared Redis/Valkey connection for caching, rate limiting and BullMQ producers.
 * `maxRetriesPerRequest: null` is required by BullMQ; `lazyConnect` lets the app boot while Redis
 * is down (health then reports it).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: AppConfig) {
    this.client = RedisService.connect(config.env.REDIS_URL);
  }

  /** New connection with GuGu defaults (BullMQ workers need their own blocking connection). */
  static connect(url: string): Redis {
    return new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== "end") {
      await this.client.quit().catch(() => {
        this.client.disconnect();
      });
    }
  }
}
