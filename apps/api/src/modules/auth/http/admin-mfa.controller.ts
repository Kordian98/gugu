import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  type AdminMfaCodeInput,
  adminMfaCodeInputSchema,
  type AdminMfaEnrolment,
  adminMfaEnrolmentSchema,
  type AdminMfaRecoveryCodes,
  adminMfaRecoveryCodesSchema,
  type AdminMfaStatus,
  adminMfaStatusSchema,
  type AdminStepUpInput,
  adminStepUpInputSchema,
  type AdminStepUpResult,
  adminStepUpResultSchema,
  problemSchema,
} from "@gugu/contracts";
import { RequirePlatformPermission } from "../../../common/guards/auth-policy";
import { CurrentUser, type UserPrincipal } from "../../../common/guards/principal";
import { requestMeta } from "../infra/http-meta";
import { AdminMfaService } from "../mfa/admin-mfa.service";

/**
 * Platform-admin second factor (topic 05 step 9, ADR-0011): TOTP enrolment, recovery codes and
 * step-up of the current session. Every platform role has `platform.mfa.self`; salon members get
 * 403 like on every other /admin route. Responses never contain a stored secret: the TOTP secret
 * and recovery codes are shown once, when created.
 */
@ApiTags("admin")
@Controller("admin/mfa")
export class AdminMfaController {
  constructor(private readonly mfa: AdminMfaService) {}

  @Get()
  @RequirePlatformPermission("platform.mfa.self")
  @ApiOperation({
    operationId: "admin.mfaStatus",
    summary: "My second factor: enrolled, recovery codes left, step-up end of this session.",
  })
  @ApiResponse({ status: 200, description: "Status.", standardSchema: adminMfaStatusSchema })
  status(@CurrentUser() admin: UserPrincipal): Promise<AdminMfaStatus> {
    return this.mfa.status(admin);
  }

  @Post("totp/enrol")
  @HttpCode(200)
  @RequirePlatformPermission("platform.mfa.self")
  @ApiOperation({
    operationId: "admin.mfaStartEnrolment",
    summary:
      "Start a TOTP enrolment (QR / secret shown once). First time: needs a sign-in within 15 min; replacing a factor: needs a step-up.",
  })
  @ApiResponse({ status: 200, description: "Pending.", standardSchema: adminMfaEnrolmentSchema })
  @ApiResponse({
    status: 403,
    description: "Fresh sign-in or step-up required.",
    standardSchema: problemSchema,
  })
  startEnrolment(@CurrentUser() admin: UserPrincipal): Promise<AdminMfaEnrolment> {
    return this.mfa.startEnrolment(admin);
  }

  @Post("totp/confirm")
  @HttpCode(200)
  @RequirePlatformPermission("platform.mfa.self")
  @ApiOperation({
    operationId: "admin.mfaConfirmEnrolment",
    summary: "Confirm the enrolment with the first code; returns recovery codes once.",
  })
  @ApiResponse({
    status: 200,
    description: "Enrolled; session stepped up.",
    standardSchema: adminMfaRecoveryCodesSchema,
  })
  @ApiResponse({ status: 400, description: "Wrong code.", standardSchema: problemSchema })
  @ApiResponse({ status: 409, description: "No enrolment started.", standardSchema: problemSchema })
  @ApiResponse({ status: 429, description: "Too many wrong codes.", standardSchema: problemSchema })
  confirm(
    @Body({ schema: adminMfaCodeInputSchema }) body: AdminMfaCodeInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMfaRecoveryCodes> {
    return this.mfa.confirmEnrolment(admin, body.code, requestMeta(req));
  }

  @Post("step-up")
  @HttpCode(200)
  @RequirePlatformPermission("platform.mfa.self")
  @ApiOperation({
    operationId: "admin.mfaStepUp",
    summary: "Verify a TOTP or recovery code: elevates this session for 10 minutes.",
  })
  @ApiResponse({ status: 200, description: "Elevated.", standardSchema: adminStepUpResultSchema })
  @ApiResponse({ status: 400, description: "Wrong code.", standardSchema: problemSchema })
  @ApiResponse({ status: 403, description: "Not enrolled.", standardSchema: problemSchema })
  @ApiResponse({ status: 429, description: "Too many wrong codes.", standardSchema: problemSchema })
  stepUp(
    @Body({ schema: adminStepUpInputSchema }) body: AdminStepUpInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminStepUpResult> {
    return this.mfa.stepUp(admin, body, requestMeta(req));
  }

  @Post("recovery-codes")
  @HttpCode(200)
  @RequirePlatformPermission("platform.mfa.self")
  @ApiOperation({
    operationId: "admin.mfaRegenerateRecoveryCodes",
    summary: "Replace all recovery codes (needs a current TOTP code); returns them once.",
  })
  @ApiResponse({
    status: 200,
    description: "New codes.",
    standardSchema: adminMfaRecoveryCodesSchema,
  })
  @ApiResponse({ status: 400, description: "Wrong code.", standardSchema: problemSchema })
  regenerate(
    @Body({ schema: adminMfaCodeInputSchema }) body: AdminMfaCodeInput,
    @CurrentUser() admin: UserPrincipal,
    @Req() req: Request,
  ): Promise<AdminMfaRecoveryCodes> {
    return this.mfa.regenerateRecoveryCodes(admin, body.code, requestMeta(req));
  }
}
