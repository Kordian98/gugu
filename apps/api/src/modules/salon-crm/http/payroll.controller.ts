import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type AdjustmentInput,
  adjustmentInputSchema,
  type CommissionLines,
  commissionLinesSchema,
  type CommissionPolicyInput,
  commissionPolicyInputSchema,
  exportQuerySchema,
  managerAccessInputSchema,
  memberParamsSchema,
  monthSchema,
  type MonthQuery,
  monthQuerySchema,
  type MyEarnings,
  myEarningsSchema,
  paidInputSchema,
  payrollAdjustmentParamsSchema,
  type PayrollAdjustment,
  payrollAdjustmentSchema,
  type PayrollExport,
  type PayrollExportQuery,
  payrollExportSchema,
  type PayrollMonth,
  payrollMonthParamsSchema,
  payrollMonthSchema,
  payrollMonthStaffParamsSchema,
  type PayrollSettings,
  payrollSettingsSchema,
  payrollStaffParamsSchema,
  type PayVersionInput,
  payVersionInputSchema,
  problemSchema,
  reasonInputSchema,
  type SalonCost,
  type SalonCostInput,
  salonCostInputSchema,
  type SalonCostList,
  salonCostListSchema,
  salonCostParamsSchema,
  salonCostSchema,
  type SalonCostUpdate,
  salonCostUpdateSchema,
  salonParamsSchema,
  type StaffPay,
  staffPaySchema,
} from "@gugu/contracts";
import { z } from "zod";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { PaySettingsService } from "../payroll/pay-settings.service";
import { payrollTable, toCsv, toXlsx } from "../payroll/payroll-export";
import { PayrollService } from "../payroll/payroll.service";
import { SalonCostsService } from "../payroll/salon-costs.service";

type SalonP = { salonId: string };
type StaffP = { salonId: string; staffId: string };
type MonthP = { salonId: string; month: string };
type MonthStaffP = MonthP & { staffId: string };

const linesQuerySchema = z.object({ month: monthSchema });
const costDeleteQuerySchema = linesQuerySchema;

/**
 * Staff pay, payroll and fixed costs (topic 07, ADR-0016). `payroll.read` / `payroll.manage` are
 * owner-only by default (grantable to managers); `payroll.self.read` is each member's own pay.
 * Bookkeeping only — no payment is processed; figures are estimates before tax and insurance.
 */
@ApiTags("payroll")
@Controller("salons/:salonId")
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly settings: PaySettingsService,
    private readonly costs: SalonCostsService,
  ) {}

  @Get("payroll")
  @RequirePermission("payroll.read")
  @ApiOperation({
    operationId: "payroll.getMonth",
    summary: "Payroll of a month: base + commission + adjustments per person (salon timezone).",
  })
  @ApiResponse({ status: 200, description: "Payroll.", standardSchema: payrollMonthSchema })
  async month(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @Query({ schema: monthQuerySchema }) q: MonthQuery,
    @CurrentSalon() salon: SalonContext,
  ): Promise<PayrollMonth> {
    return this.payroll.month(salon, q.month ?? (await this.payroll.currentMonth(salon.salonId)));
  }

  @Get("payroll/me")
  @RequirePermission("payroll.self.read")
  @ApiOperation({
    operationId: "payroll.getMine",
    summary: "The caller's own commission and earnings estimate for a month (never anyone else's).",
  })
  @ApiResponse({ status: 200, description: "Own estimate.", standardSchema: myEarningsSchema })
  async mine(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @Query({ schema: monthQuerySchema }) q: MonthQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<MyEarnings> {
    const month = q.month ?? (await this.payroll.currentMonth(salon.salonId));
    return this.payroll.mine(salon, user.userId, month);
  }

  @Get("payroll/staff/:staffId/lines")
  @RequirePermission("payroll.read")
  @ApiOperation({
    operationId: "payroll.getCommissionLines",
    summary: "Commission per completed (and upcoming) service of one person in a month.",
  })
  @ApiResponse({ status: 200, description: "Lines.", standardSchema: commissionLinesSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  lines(
    @Param({ schema: payrollStaffParamsSchema }) p: StaffP,
    @Query({ schema: linesQuerySchema }) q: { month: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<CommissionLines> {
    return this.payroll.lines(salon, q.month, p.staffId);
  }

  @Get("payroll/export")
  @RequirePermission("payroll.read")
  @ApiOperation({
    operationId: "payroll.export",
    summary: "Payroll of a month as CSV or XLSX. Audited.",
  })
  @ApiResponse({ status: 200, description: "File.", standardSchema: payrollExportSchema })
  async export(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @Query({ schema: exportQuerySchema }) q: PayrollExportQuery,
    @CurrentSalon() salon: SalonContext,
  ): Promise<PayrollExport> {
    const month = await this.payroll.month(salon, q.month);
    const table = payrollTable(month, q.locale);
    await this.payroll.recordExport(salon, q.month, q.format, month.rows.length);
    const base = `gugu-payroll-${q.month}`;
    return q.format === "csv"
      ? {
          fileName: `${base}.csv`,
          mimeType: "text/csv",
          encoding: "utf8",
          content: toCsv(table).toString("utf8"),
        }
      : {
          fileName: `${base}.xlsx`,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          encoding: "base64",
          content: toXlsx(table, q.month).toString("base64"),
        };
  }

  @Post("payroll/adjustments")
  @RequirePermission("payroll.manage")
  @HttpCode(201)
  @ApiOperation({
    operationId: "payroll.addAdjustment",
    summary: "Add a bonus, deduction or advance with a reason (open months only). Audited.",
  })
  @ApiResponse({ status: 201, description: "Added.", standardSchema: payrollAdjustmentSchema })
  @ApiResponse({ status: 409, description: "Month closed.", standardSchema: problemSchema })
  addAdjustment(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @Body({ schema: adjustmentInputSchema }) body: AdjustmentInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<PayrollAdjustment> {
    return this.payroll.addAdjustment(salon, user.userId, body);
  }

  @Delete("payroll/adjustments/:adjustmentId")
  @RequirePermission("payroll.manage")
  @HttpCode(204)
  @ApiOperation({
    operationId: "payroll.removeAdjustment",
    summary: "Remove an adjustment (open months only). Audited.",
  })
  @ApiResponse({ status: 204, description: "Removed." })
  @ApiResponse({ status: 409, description: "Month closed.", standardSchema: problemSchema })
  async removeAdjustment(
    @Param({ schema: payrollAdjustmentParamsSchema }) p: { salonId: string; adjustmentId: string },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.payroll.removeAdjustment(salon, user.userId, p.adjustmentId);
  }

  @Post("payroll/months/:month/close")
  @RequirePermission("payroll.manage")
  @HttpCode(200)
  @ApiOperation({
    operationId: "payroll.closeMonth",
    summary: "Close a month: snapshot the figures, read-only afterwards. Audited.",
  })
  @ApiResponse({ status: 200, description: "Closed.", standardSchema: payrollMonthSchema })
  @ApiResponse({
    status: 409,
    description: "Already closed or not started.",
    standardSchema: problemSchema,
  })
  close(
    @Param({ schema: payrollMonthParamsSchema }) p: MonthP,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<PayrollMonth> {
    return this.payroll.close(salon, user.userId, p.month);
  }

  @Post("payroll/months/:month/reopen")
  @RequirePermission("payroll.manage")
  @HttpCode(200)
  @ApiOperation({
    operationId: "payroll.reopenMonth",
    summary: "Reopen a closed month (reason required). Audited.",
  })
  @ApiResponse({ status: 200, description: "Reopened.", standardSchema: payrollMonthSchema })
  @ApiResponse({ status: 409, description: "Not closed.", standardSchema: problemSchema })
  reopen(
    @Param({ schema: payrollMonthParamsSchema }) p: MonthP,
    @Body({ schema: reasonInputSchema }) body: { reason: string },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<PayrollMonth> {
    return this.payroll.reopen(salon, user.userId, p.month, body.reason);
  }

  @Put("payroll/months/:month/staff/:staffId/paid")
  @RequirePermission("payroll.manage")
  @ApiOperation({
    operationId: "payroll.markPaid",
    summary: "Note that a person was paid on a date (closed months; bookkeeping only). Audited.",
  })
  @ApiResponse({ status: 200, description: "Marked.", standardSchema: payrollMonthSchema })
  @ApiResponse({ status: 409, description: "Month not closed.", standardSchema: problemSchema })
  markPaid(
    @Param({ schema: payrollMonthStaffParamsSchema }) p: MonthStaffP,
    @Body({ schema: paidInputSchema }) body: { paidOn: string },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<PayrollMonth> {
    return this.payroll.markPaid(salon, user.userId, p.month, p.staffId, body.paidOn);
  }

  @Delete("payroll/months/:month/staff/:staffId/paid")
  @RequirePermission("payroll.manage")
  @ApiOperation({
    operationId: "payroll.unmarkPaid",
    summary: "Remove the 'paid on' note. Audited.",
  })
  @ApiResponse({ status: 200, description: "Removed.", standardSchema: payrollMonthSchema })
  unmarkPaid(
    @Param({ schema: payrollMonthStaffParamsSchema }) p: MonthStaffP,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<PayrollMonth> {
    return this.payroll.markPaid(salon, user.userId, p.month, p.staffId, null);
  }

  // ─── Settings ───────────────────────────────────────────────────────────────────────────

  @Get("payroll/settings")
  @RequirePermission("payroll.read")
  @ApiOperation({
    operationId: "payroll.getSettings",
    summary: "Commission base, everyone's current pay settings, manager access.",
  })
  @ApiResponse({ status: 200, description: "Settings.", standardSchema: payrollSettingsSchema })
  getSettings(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @CurrentSalon() salon: SalonContext,
  ): Promise<PayrollSettings> {
    return this.settings.settings(salon);
  }

  @Put("payroll/settings/commission-base")
  @RequirePermission("payroll.manage")
  @ApiOperation({
    operationId: "payroll.saveCommissionBase",
    summary: "Commission base from a date (history kept). Audited.",
  })
  @ApiResponse({ status: 200, description: "Saved.", standardSchema: payrollSettingsSchema })
  saveBase(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @Body({ schema: commissionPolicyInputSchema }) body: CommissionPolicyInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<PayrollSettings> {
    return this.settings.savePolicy(salon, user.userId, body);
  }

  @Put("members/:memberId/payroll-access")
  // Changing what a manager may see is a role decision: owner-only (members.roles.write).
  @RequirePermission("members.roles.write")
  @ApiOperation({
    operationId: "payroll.setManagerAccess",
    summary: "Let a manager see and manage payroll (owner only). Audited.",
  })
  @ApiResponse({ status: 200, description: "Saved.", standardSchema: payrollSettingsSchema })
  @ApiResponse({ status: 409, description: "Not a manager.", standardSchema: problemSchema })
  managerAccess(
    @Param({ schema: memberParamsSchema }) p: { salonId: string; memberId: string },
    @Body({ schema: managerAccessInputSchema }) body: { granted: boolean },
    @CurrentSalon() salon: SalonContext,
  ): Promise<PayrollSettings> {
    return this.settings.setManagerAccess(salon, p.memberId, body.granted);
  }

  @Get("payroll/staff/:staffId/pay")
  @RequirePermission("payroll.read")
  @ApiOperation({
    operationId: "payroll.getStaffPay",
    summary: "One person's pay settings with history.",
  })
  @ApiResponse({ status: 200, description: "Pay.", standardSchema: staffPaySchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  staffPay(
    @Param({ schema: payrollStaffParamsSchema }) p: StaffP,
    @CurrentSalon() salon: SalonContext,
  ): Promise<StaffPay> {
    return this.settings.staffPay(salon, p.staffId);
  }

  @Put("payroll/staff/:staffId/pay")
  @RequirePermission("payroll.manage")
  @ApiOperation({
    operationId: "payroll.saveStaffPay",
    summary: "Save pay settings from a date (new version; earlier months unchanged). Audited.",
  })
  @ApiResponse({ status: 200, description: "Saved.", standardSchema: staffPaySchema })
  @ApiResponse({ status: 409, description: "Month closed.", standardSchema: problemSchema })
  saveStaffPay(
    @Param({ schema: payrollStaffParamsSchema }) p: StaffP,
    @Body({ schema: payVersionInputSchema }) body: PayVersionInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<StaffPay> {
    return this.settings.saveStaffPay(salon, user.userId, p.staffId, body);
  }

  // ─── Fixed costs ────────────────────────────────────────────────────────────────────────

  @Get("costs")
  @RequirePermission("payroll.read")
  @ApiOperation({ operationId: "costs.list", summary: "Monthly costs that apply to a month." })
  @ApiResponse({ status: 200, description: "Costs.", standardSchema: salonCostListSchema })
  async listCosts(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @Query({ schema: monthQuerySchema }) q: MonthQuery,
    @CurrentSalon() salon: SalonContext,
  ): Promise<SalonCostList> {
    return this.costs.forMonth(
      salon.salonId,
      q.month ?? (await this.payroll.currentMonth(salon.salonId)),
    );
  }

  @Post("costs")
  @RequirePermission("payroll.manage")
  @HttpCode(201)
  @ApiOperation({ operationId: "costs.create", summary: "Add a monthly or one-off cost. Audited." })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: salonCostSchema })
  createCost(
    @Param({ schema: salonParamsSchema }) _p: SalonP,
    @Body({ schema: salonCostInputSchema }) body: SalonCostInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SalonCost> {
    return this.costs.create(salon, user.userId, body);
  }

  @Patch("costs/:costId")
  @RequirePermission("payroll.manage")
  @ApiOperation({
    operationId: "costs.update",
    summary: "Change a cost from a month on (earlier months keep theirs). Audited.",
  })
  @ApiResponse({ status: 200, description: "Updated.", standardSchema: salonCostSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  updateCost(
    @Param({ schema: salonCostParamsSchema }) p: { salonId: string; costId: string },
    @Body({ schema: salonCostUpdateSchema }) body: SalonCostUpdate,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SalonCost> {
    return this.costs.update(salon, user.userId, p.costId, body);
  }

  @Delete("costs/:costId")
  @RequirePermission("payroll.manage")
  @HttpCode(204)
  @ApiOperation({ operationId: "costs.remove", summary: "Stop a cost from a month on. Audited." })
  @ApiResponse({ status: 204, description: "Removed." })
  async removeCost(
    @Param({ schema: salonCostParamsSchema }) p: { salonId: string; costId: string },
    @Query({ schema: costDeleteQuerySchema }) q: { month: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.costs.remove(salon, p.costId, q.month);
  }
}
