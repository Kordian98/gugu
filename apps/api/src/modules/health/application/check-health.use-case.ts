import { Inject, Injectable } from "@nestjs/common";
import type { HealthReport } from "@gugu/contracts";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { DATABASE_PROBE, type Probe, REDIS_PROBE } from "./probes";

@Injectable()
export class CheckHealthUseCase {
  constructor(
    private readonly config: AppConfig,
    @Inject(DATABASE_PROBE) private readonly database: Probe,
    @Inject(REDIS_PROBE) private readonly redis: Probe,
  ) {}

  async execute(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.database.check(), this.redis.check()]);
    const allUp = database.status === "up" && redis.status === "up";
    return {
      status: allUp ? "ok" : "down",
      checks: { database, redis },
      version: this.config.env.APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
