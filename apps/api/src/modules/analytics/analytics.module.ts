import { Global, Module } from "@nestjs/common";
import { AnalyticsService } from "./application/analytics.service";

/** Minimal in-house analytics store (X14); topic 12 extends it with rollups and client events. */
@Global()
@Module({ providers: [AnalyticsService], exports: [AnalyticsService] })
export class AnalyticsModule {}
