import { Module } from "@nestjs/common";
import { AiImportModule } from "../ai-import/ai-import.facade";
import { AdminActions } from "./application/admin-actions";
import { AdminSalonsQueries } from "./application/admin-salons.queries";
import { AdminUsageQueries } from "./application/admin-usage.queries";
import { AdminController } from "./http/admin.controller";

/**
 * Platform admin (topic 12 M12.6, docs/domains/monetization-admin.md#platform-admin). Thin BFF:
 * cross-tenant read models for GuGu staff, and writes that delegate to the owning modules
 * (subscriptions) through AdminActions, which adds the reason + audit row + cache invalidation.
 */
@Module({
  imports: [AiImportModule],
  controllers: [AdminController],
  providers: [AdminActions, AdminSalonsQueries, AdminUsageQueries],
})
export class AdminModule {}
