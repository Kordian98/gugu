import { Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  type AdminMfaResetInput,
  adminMfaResetInputSchema,
  type AdminMutationResult,
  adminMutationResultSchema,
  type AdminTeamList,
  adminTeamListSchema,
  adminTeamParamsSchema,
  problemSchema,
} from "@gugu/contracts";
import { RequirePlatformPermission } from "../../../common/guards/auth-policy";
import { CurrentUser, type UserPrincipal } from "../../../common/guards/principal";
import { AdminMfaResetService, requestMeta } from "../../auth/auth.facade";
import { AdminActions } from "../application/admin-actions";

/**
 * GuGu admin team (owner answer q93): a super_admin sees every admin's 2FA state and can reset
 * ANOTHER admin's second factor after they lost both the device and all recovery codes. The reset
 * needs the actor's own step-up and a reason, is audited with actor and target, and revokes the
 * target's factor, recovery codes and sessions. `platform.mfa.reset` is super_admin only.
 */
@ApiTags("admin")
@Controller("admin/team")
export class AdminTeamController {
  constructor(
    private readonly mfa: AdminMfaResetService,
    private readonly actions: AdminActions,
  ) {}

  @Get()
  @RequirePlatformPermission("platform.mfa.reset")
  @ApiOperation({
    operationId: "admin.listTeam",
    summary: "GuGu admins with their two-step verification state (no secrets).",
  })
  @ApiResponse({ status: 200, description: "Admins.", standardSchema: adminTeamListSchema })
  list(@CurrentUser() admin: UserPrincipal): Promise<AdminTeamList> {
    return this.mfa.team(admin);
  }

  @Post(":userId/mfa/reset")
  @HttpCode(200)
  @RequirePlatformPermission("platform.mfa.reset")
  @ApiOperation({
    operationId: "admin.resetAdminMfa",
    summary:
      "Reset another admin's two-step verification (factor, recovery codes, sessions). Needs a step-up and a reason; never yourself.",
  })
  @ApiResponse({
    status: 200,
    description: "Reset; audit row id.",
    standardSchema: adminMutationResultSchema,
  })
  @ApiResponse({ status: 400, description: "Reason required.", standardSchema: problemSchema })
  @ApiResponse({
    status: 403,
    description: "Not a super_admin, no enrolled factor or step-up, or your own account.",
    standardSchema: problemSchema,
  })
  @ApiResponse({ status: 404, description: "No such admin.", standardSchema: problemSchema })
  reset(
    @Param({ schema: adminTeamParamsSchema }) p: { userId: string },
    @Body({ schema: adminMfaResetInputSchema }) body: AdminMfaResetInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMutationResult> {
    return this.actions.runOnAdmin(
      {
        admin,
        action: "admin.mfa_reset_by_admin",
        reason: body.reason,
        meta: requestMeta(req),
        stepUp: true,
      },
      (db) => this.mfa.resetFactorsFor(db, admin, p.userId),
    );
  }
}
