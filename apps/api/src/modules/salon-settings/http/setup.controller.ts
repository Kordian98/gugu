import { Body, Controller, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  problemSchema,
  salonParamsSchema,
  type SetupBusinessInput,
  setupBusinessInputSchema,
  type SetupProgressInput,
  setupProgressInputSchema,
  type SetupState,
  setupStateSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { SetupService } from "../application/setup.service";

type SalonParams = { salonId: string };

/** Guided setup after the email-only signup (07 §3.7, owner 2026-11-04). Tenant from the guard. */
@ApiTags("salon-settings")
@Controller("salons/:salonId/onboarding")
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Patch("business")
  @RequirePermission("salon.profile.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salonSettings.setupBusiness",
    summary: "Setup step (a): salon name and business type.",
  })
  @ApiResponse({ status: 204, description: "Saved." })
  @ApiResponse({ status: 400, description: "Invalid input.", standardSchema: problemSchema })
  async business(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: setupBusinessInputSchema }) body: SetupBusinessInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.setup.saveBusiness(salon, user, body);
  }

  @Post("progress")
  @RequirePermission("salon.settings.write")
  @HttpCode(200)
  @ApiOperation({
    operationId: "salonSettings.setupProgress",
    summary:
      "Record a wizard step as viewed, completed, skipped or left (resumable, PII-free events).",
  })
  @ApiResponse({ status: 200, description: "Setup state.", standardSchema: setupStateSchema })
  async progress(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: setupProgressInputSchema }) body: SetupProgressInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SetupState> {
    return this.setup.progress(salon, user, body);
  }

  @Post("dismiss-card")
  @RequirePermission("salon.settings.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salonSettings.dismissSetupCard",
    summary: "Hide the Today 'finish setup' card for good.",
  })
  @ApiResponse({ status: 204, description: "Dismissed." })
  async dismissCard(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.setup.dismissCard(salon, user);
  }
}
