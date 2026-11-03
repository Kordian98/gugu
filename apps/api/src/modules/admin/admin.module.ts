import { Module } from "@nestjs/common";
import { AiImportModule } from "../ai-import/ai-import.facade";
import { AuthModule } from "../auth/auth.facade";
import { AdminActions } from "./application/admin-actions";
import { AdminSalonsQueries } from "./application/admin-salons.queries";
import { AdminUsageQueries } from "./application/admin-usage.queries";
import { AdminController } from "./http/admin.controller";
import { AdminTeamController } from "./http/admin-team.controller";

/**
 * Platform admin (topic 12 M12.6, docs/domains/monetization-admin.md#platform-admin). Thin BFF:
 * cross-tenant read models for GuGu staff, and writes that delegate to the owning modules
 * (subscriptions) through AdminActions, which adds the reason + audit row + cache invalidation.
 */
@Module({
  imports: [AiImportModule, AuthModule],
  controllers: [AdminController, AdminTeamController],
  providers: [AdminActions, AdminSalonsQueries, AdminUsageQueries],
})
export class AdminModule {}
