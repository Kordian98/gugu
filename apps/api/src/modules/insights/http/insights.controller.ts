import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type Insights,
  type InsightsQuery,
  insightsQuerySchema,
  insightsSchema,
  salonParamsSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { CrmScopes } from "../../salon-crm/salon-crm.facade";
import { InsightsService } from "../application/insights.service";

/** Insights (07 M7.8): analytics.read = whole salon, analytics.read.own (staff) = own appointments. */
@ApiTags("insights")
@Controller("salons/:salonId/insights")
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly scopes: CrmScopes,
  ) {}

  @Get()
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "insights.get",
    summary: "Metric catalogue values, previous period, series and breakdowns.",
  })
  @ApiResponse({ status: 200, description: "Insights.", standardSchema: insightsSchema })
  async get(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: insightsQuerySchema }) query: InsightsQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<Insights> {
    const scope = await this.scopes.resolve(
      salon,
      user.userId,
      "analytics.read",
      "analytics.read.own",
    );
    return this.insights.compute(salon, scope, query.from, query.to);
  }
}
