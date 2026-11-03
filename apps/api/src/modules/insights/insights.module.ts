import { Module } from "@nestjs/common";
import { SalonCrmModule } from "../salon-crm/salon-crm.facade";
import { InsightsService } from "./application/insights.service";
import { ProfitService } from "./application/profit.service";
import { InsightsController } from "./http/insights.controller";

/** Insights over the metric catalogue (07 M7.8). Topic 08 can expose the same numbers as tools. */
@Module({
  imports: [SalonCrmModule],
  controllers: [InsightsController],
  providers: [InsightsService, ProfitService],
  exports: [InsightsService, ProfitService],
})
export class InsightsModule {}
