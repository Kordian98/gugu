import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppConfig } from "../config/app-config";
import { PrismaClient } from "./generated/client";

/**
 * The only Prisma client in the API (Prisma 7 + driver adapter `pg`, ADR-0008). Pool size comes
 * from DATABASE_POOL_MAX because adapter pools use node-postgres defaults, not Prisma's.
 * Connects lazily on first query so the app can boot (and report 503) while the DB is down.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.env.DATABASE_URL,
        max: config.env.DATABASE_POOL_MAX,
        connectionTimeoutMillis: 3_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
