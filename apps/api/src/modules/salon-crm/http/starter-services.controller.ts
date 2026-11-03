import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  salonParamsSchema,
  type StarterServicesInputParsed,
  starterServicesInputSchema,
  type StarterServicesResult,
  starterServicesResultSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { StarterServicesService } from "../application/starter-services.service";

/** Guided setup step (c), path B: template services (ADR-0018). Tenant from the guard. */
@ApiTags("salon-settings")
@Controller("salons/:salonId/onboarding")
export class StarterServicesController {
  constructor(private readonly starter: StarterServicesService) {}

  @Post("starter-services")
  @RequirePermission("services.write")
  @HttpCode(200)
  @ApiOperation({
    operationId: "salonSettings.addStarterServices",
    summary: "Setup step (c): add reviewed services from a business-type template.",
  })
  @ApiResponse({
    status: 200,
    description: "Created.",
    standardSchema: starterServicesResultSchema,
  })
  async add(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: starterServicesInputSchema }) body: StarterServicesInputParsed,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<StarterServicesResult> {
    return this.starter.add(salon, user, body);
  }
}
