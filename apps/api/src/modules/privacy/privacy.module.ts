import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.facade";
import { BookingsEngineModule } from "../bookings/bookings.facade";
import { ClientPrivacyService } from "./application/client-privacy.service";
import { RetentionService } from "./application/retention.service";
import { SalonExportService } from "./application/salon-export.service";
import { PrivacyController } from "./http/privacy.controller";

/**
 * Privacy (topic 05 step 8; docs/domains/auth-security.md#privacy): owner tools to export or erase
 * one client, salon-wide async export, retention purge. Designed to support data-subject requests
 * under Law 91/2025/QH15 concepts; no compliance claim (legal review pending, q04).
 */
@Module({
  imports: [AuditModule, BookingsEngineModule],
  controllers: [PrivacyController],
  // RetentionService runs in the worker; registered here too so ops scripts/tests can call it.
  providers: [ClientPrivacyService, SalonExportService, RetentionService],
})
export class PrivacyModule {}

/** Worker slice: export builder and retention purge (no controllers). */
@Module({
  imports: [AuditModule],
  providers: [SalonExportService, RetentionService],
  exports: [SalonExportService, RetentionService],
})
export class PrivacyWorkerModule {}
