import { Module } from "@nestjs/common";
import { CheckHealthUseCase } from "./application/check-health.use-case";
import { DATABASE_PROBE, REDIS_PROBE } from "./application/probes";
import { HealthController } from "./health.controller";
import { PrismaProbe, RedisProbe } from "./health.probes";

@Module({
  controllers: [HealthController],
  providers: [
    CheckHealthUseCase,
    { provide: DATABASE_PROBE, useClass: PrismaProbe },
    { provide: REDIS_PROBE, useClass: RedisProbe },
  ],
})
export class HealthModule {}
