import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type Insights,
  type InsightsQuery,
  insightsQuerySchema,
  insightsSchema,
  type MonthQuery,
  monthQuerySchema,
  type Profit,
  profitSchema,
  salonParamsSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { CrmScopes, PayrollClock, PayrollService } from "../../salon-crm/salon-crm.facade";
import { InsightsService } from "../application/insights.service";
import { ProfitService } from "../application/profit.service";

/** Insights (07 M7.8): analytics.read = whole salon, analytics.read.own (staff) = own appointments. */
@ApiTags("insights")
@Controller("salons/:salonId/insights")
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly scopes: CrmScopes,
    private readonly profit: ProfitService,
    private readonly payroll: PayrollService,
    private readonly clock: PayrollClock,
  ) {}

  @Get("profit")
  // Includes the team's payroll total: owner by default, managers only by an owner grant.
  @RequirePermission("payroll.read")
  @ApiOperation({
    operationId: "insights.getProfit",
    summary:
      "This month's estimated profit: earned so far, still to come, service costs, payroll, other costs, net and margins (metric catalogue profit.*).",
  })
  @ApiResponse({ status: 200, description: "Profit view.", standardSchema: profitSchema })
  async getProfit(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: monthQuerySchema }) q: MonthQuery,
    @CurrentSalon() salon: SalonContext,
  ): Promise<Profit> {
    const month = q.month ?? (await this.payroll.currentMonth(salon.salonId));
    return this.profit.compute(salon.salonId, month, this.clock.now());
  }

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
