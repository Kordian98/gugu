import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  problemSchema,
  type SalonEntitlements,
  salonEntitlementsSchema,
  salonIdParamSchema,
} from "@gugu/contracts";
import { EntitlementService } from "../application/entitlement.service";
import { SalonReadAccessGuard } from "./salon-access";

@ApiTags("subscriptions")
@Controller("salons/:salonId/entitlements")
@UseGuards(SalonReadAccessGuard)
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementService) {}

  @Get()
  @ApiOperation({
    operationId: "subscriptions.getEntitlements",
    summary:
      "Current plan, subscription status and resolved entitlements of a salon (for UI gating; the API enforces).",
  })
  @ApiResponse({
    status: 200,
    description: "Resolved entitlements.",
    standardSchema: salonEntitlementsSchema,
  })
  @ApiResponse({ status: 400, description: "Invalid salon id.", standardSchema: problemSchema })
  @ApiResponse({ status: 401, description: "Not authenticated.", standardSchema: problemSchema })
  async get(
    @Param({ schema: salonIdParamSchema }) params: { salonId: string },
  ): Promise<SalonEntitlements> {
    return this.entitlements.forSalon(params.salonId);
  }
}
