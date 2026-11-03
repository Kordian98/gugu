import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  type AdminAssignPlanInput,
  adminAssignPlanInputSchema,
  type AdminCreateOverrideInput,
  adminCreateOverrideInputSchema,
  type AdminExtendTrialInput,
  adminExtendTrialInputSchema,
  type AdminMutationResult,
  adminMutationResultSchema,
  adminOverrideParamsSchema,
  type AdminReasonInput,
  adminReasonInputSchema,
  type AdminSalonDetail,
  adminSalonDetailSchema,
  type AdminSalonList,
  type AdminSalonListQuery,
  adminSalonListQuerySchema,
  adminSalonListSchema,
  adminSalonParamsSchema,
  type AdminSetPaidUntilInput,
  adminSetPaidUntilInputSchema,
  type AdminUsageOverview,
  adminUsageOverviewSchema,
  type AdminUsageQuery,
  adminUsageQuerySchema,
  problemSchema,
} from "@gugu/contracts";
import { RequirePlatformPermission } from "../../../common/guards/auth-policy";
import { CurrentUser, type UserPrincipal } from "../../../common/guards/principal";
import { requestMeta } from "../../auth/auth.facade";
import { Clock, SubscriptionAdminService } from "../../subscriptions/subscriptions.facade";
import { AdminActions, suspendSalon, unsuspendSalon } from "../application/admin-actions";
import { AdminSalonsQueries } from "../application/admin-salons.queries";
import { AdminUsageQueries } from "../application/admin-usage.queries";

type SalonParams = { salonId: string };
type OverrideParams = { salonId: string; overrideId: string };

const MutationResponses = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: "Done; audit row id.",
      standardSchema: adminMutationResultSchema,
    }),
    ApiResponse({
      status: 400,
      description: "Validation (reason required).",
      standardSchema: problemSchema,
    }),
    ApiResponse({
      status: 403,
      description: "Not a platform admin, missing permission or step-up.",
      standardSchema: problemSchema,
    }),
    ApiResponse({ status: 404, description: "Salon not found.", standardSchema: problemSchema }),
    ApiResponse({
      status: 409,
      description: "Not allowed in the current state.",
      standardSchema: problemSchema,
    }),
  );

/**
 * Platform admin API (topic 12 M12.6). GuGu staff only: every route needs a platform permission
 * (default deny; a salon role grants none). Writes go through AdminActions (reason + audit row in
 * the same transaction, entitlement cache invalidated after commit). Thin: no business rules here.
 */
@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly salons: AdminSalonsQueries,
    private readonly usage: AdminUsageQueries,
    private readonly actions: AdminActions,
    private readonly subscriptions: SubscriptionAdminService,
    private readonly clock: Clock,
  ) {}

  @Get("salons")
  @RequirePlatformPermission("platform.directory.read")
  @ApiOperation({ operationId: "admin.listSalons", summary: "Salon directory with filters." })
  @ApiResponse({
    status: 200,
    description: "Page of salons.",
    standardSchema: adminSalonListSchema,
  })
  list(
    @Query({ schema: adminSalonListQuerySchema }) q: AdminSalonListQuery,
  ): Promise<AdminSalonList> {
    return this.salons.list(q);
  }

  @Get("salons/:salonId")
  @RequirePlatformPermission("platform.directory.read")
  @ApiOperation({
    operationId: "admin.getSalon",
    summary: "Salon detail: members, subscription, overrides, usage, recent audit.",
  })
  @ApiResponse({ status: 200, description: "Salon.", standardSchema: adminSalonDetailSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  detail(@Param({ schema: adminSalonParamsSchema }) p: SalonParams): Promise<AdminSalonDetail> {
    return this.salons.detail(p.salonId);
  }

  @Get("usage")
  @RequirePlatformPermission("platform.usage.read")
  @ApiOperation({
    operationId: "admin.usageOverview",
    summary:
      "AI cost vs cap and Zalo template sends per salon for a month; trials ending in 7 days.",
  })
  @ApiResponse({ status: 200, description: "Usage.", standardSchema: adminUsageOverviewSchema })
  usageOverview(
    @Query({ schema: adminUsageQuerySchema }) q: AdminUsageQuery,
  ): Promise<AdminUsageOverview> {
    return this.usage.overview(q);
  }

  @Post("salons/:salonId/subscription/plan")
  @HttpCode(200)
  @RequirePlatformPermission("platform.subscriptions.write")
  @ApiOperation({
    operationId: "admin.assignPlan",
    summary: "Assign or change the paid plan (manual billing); subscription becomes active.",
  })
  @MutationResponses()
  assignPlan(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminAssignPlanInputSchema }) body: AdminAssignPlanInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    const { reason, ...input } = body;
    return this.actions.run(
      {
        admin,
        action: "admin.subscription_plan_assigned",
        salonId: p.salonId,
        reason,
        meta: requestMeta(req),
      },
      (db, actor) => this.subscriptions.assignPlan(db, p.salonId, input, actor, reason),
    );
  }

  @Post("salons/:salonId/subscription/trial")
  @HttpCode(200)
  @RequirePlatformPermission("platform.subscriptions.write")
  @ApiOperation({
    operationId: "admin.extendTrial",
    summary: "Move the trial end (≤ 90 days ahead); re-opens an expired trial.",
  })
  @MutationResponses()
  extendTrial(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminExtendTrialInputSchema }) body: AdminExtendTrialInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.run(
      {
        admin,
        action: "admin.trial_extended",
        salonId: p.salonId,
        reason: body.reason,
        meta: requestMeta(req),
      },
      (db, actor) =>
        this.subscriptions.extendTrial(db, p.salonId, body.trialEndsAt, actor, body.reason),
    );
  }

  @Post("salons/:salonId/subscription/paid-until")
  @HttpCode(200)
  @RequirePlatformPermission("platform.subscriptions.write")
  @ApiOperation({
    operationId: "admin.setPaidUntil",
    summary: "Record the end of the paid period after an offline payment.",
  })
  @MutationResponses()
  setPaidUntil(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminSetPaidUntilInputSchema }) body: AdminSetPaidUntilInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.run(
      {
        admin,
        action: "admin.paid_until_set",
        salonId: p.salonId,
        reason: body.reason,
        meta: requestMeta(req),
      },
      (db, actor) =>
        this.subscriptions.setPaidUntil(db, p.salonId, body.paidUntil, actor, body.reason),
    );
  }

  @Post("salons/:salonId/suspend")
  @HttpCode(200)
  @RequirePlatformPermission("platform.salons.suspend")
  @ApiOperation({
    operationId: "admin.suspendSalon",
    summary: "Suspend a salon (read-only, nothing granted). Needs a recent sign-in.",
  })
  @MutationResponses()
  suspend(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminReasonInputSchema }) body: AdminReasonInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.run(
      {
        admin,
        action: "admin.salon_suspended",
        salonId: p.salonId,
        reason: body.reason,
        meta: requestMeta(req),
        stepUp: true,
      },
      (db) => suspendSalon(db, p.salonId, this.clock.now()),
    );
  }

  @Post("salons/:salonId/unsuspend")
  @HttpCode(200)
  @RequirePlatformPermission("platform.salons.suspend")
  @ApiOperation({
    operationId: "admin.unsuspendSalon",
    summary: "Lift a suspension and restore the previous status. Needs a recent sign-in.",
  })
  @MutationResponses()
  unsuspend(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminReasonInputSchema }) body: AdminReasonInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.run(
      {
        admin,
        action: "admin.salon_unsuspended",
        salonId: p.salonId,
        reason: body.reason,
        meta: requestMeta(req),
        stepUp: true,
      },
      (db) => unsuspendSalon(db, p.salonId),
    );
  }

  @Post("salons/:salonId/overrides")
  @HttpCode(200)
  @RequirePlatformPermission("platform.entitlements.write")
  @ApiOperation({
    operationId: "admin.createOverride",
    summary: "Grant or restrict one entitlement for this salon until an expiry (≤ 366 days).",
  })
  @MutationResponses()
  createOverride(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminCreateOverrideInputSchema }) body: AdminCreateOverrideInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    const { reason, ...input } = body;
    return this.actions.run(
      {
        admin,
        action: "admin.entitlement_override_created",
        salonId: p.salonId,
        reason,
        meta: requestMeta(req),
      },
      (db, actor) => this.subscriptions.createOverride(db, p.salonId, input, actor, reason),
    );
  }

  @Post("salons/:salonId/overrides/:overrideId/revoke")
  @HttpCode(200)
  @RequirePlatformPermission("platform.entitlements.write")
  @ApiOperation({ operationId: "admin.revokeOverride", summary: "Revoke an active override." })
  @MutationResponses()
  revokeOverride(
    @Param({ schema: adminOverrideParamsSchema }) p: OverrideParams,
    @Body({ schema: adminReasonInputSchema }) body: AdminReasonInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.run(
      {
        admin,
        action: "admin.entitlement_override_revoked",
        salonId: p.salonId,
        reason: body.reason,
        meta: requestMeta(req),
      },
      (db) => this.subscriptions.revokeOverride(db, p.salonId, p.overrideId),
    );
  }

  @Post("salons/:salonId/founding-partner")
  @HttpCode(200)
  @RequirePlatformPermission("platform.founding_partner.write")
  @ApiOperation({
    operationId: "admin.grantFoundingPartner",
    summary: "Mark the salon's organisation as a founding partner (X20, admin grant).",
  })
  @MutationResponses()
  grantFoundingPartner(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminReasonInputSchema }) body: AdminReasonInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.run(
      {
        admin,
        action: "admin.founding_partner_granted",
        salonId: p.salonId,
        reason: body.reason,
        meta: requestMeta(req),
      },
      (db) => this.subscriptions.grantFoundingPartner(db, p.salonId),
    );
  }

  @Post("salons/:salonId/founding-partner/revoke")
  @HttpCode(200)
  @RequirePlatformPermission("platform.founding_partner.write")
  @ApiOperation({
    operationId: "admin.revokeFoundingPartner",
    summary: "Revoke the founding-partner flag (R-FP2). Needs a recent sign-in.",
  })
  @MutationResponses()
  revokeFoundingPartner(
    @Param({ schema: adminSalonParamsSchema }) p: SalonParams,
    @Body({ schema: adminReasonInputSchema }) body: AdminReasonInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.run(
      {
        admin,
        action: "admin.founding_partner_revoked",
        salonId: p.salonId,
        reason: body.reason,
        meta: requestMeta(req),
        stepUp: true,
      },
      (db) => this.subscriptions.revokeFoundingPartner(db, p.salonId),
    );
  }
}
