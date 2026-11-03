import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  categoryListSchema,
  locationListQuerySchema,
  type LocationListQuery,
  locationListSchema,
  problemSchema,
  salonMemberListSchema,
  type SalonMemberList,
  salonParamsSchema,
  type SalonQuickStartInput,
  salonQuickStartInputSchema,
  type SalonQuickStartResult,
  salonQuickStartResultSchema,
  type SalonRegistrationInput,
  salonRegistrationInputSchema,
  type SalonRegistrationResult,
  salonRegistrationResultSchema,
  salonSummarySchema,
  type SalonSummary,
  type UpdateSalonProfileInput,
  updateSalonProfileInputSchema,
} from "@gugu/contracts";
import { Authenticated, Public, RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { requestMeta } from "../../auth/auth.facade";
import { QuickStartSalonCommand } from "../application/quick-start-salon.command";
import { RegisterSalonCommand } from "../application/register-salon.command";
import { SalonQueries } from "../application/salon.queries";
import { UpdateSalonProfileCommand } from "../application/update-salon-profile.command";

@ApiTags("salons")
@Controller()
export class SalonsController {
  constructor(
    private readonly register: RegisterSalonCommand,
    private readonly queries: SalonQueries,
    private readonly updateProfile: UpdateSalonProfileCommand,
    private readonly quickStart: QuickStartSalonCommand,
  ) {}

  @Get("public/categories")
  @Public()
  @ApiOperation({
    operationId: "salons.listCategories",
    summary: "Active top-level service categories.",
  })
  @ApiResponse({ status: 200, description: "Categories.", standardSchema: categoryListSchema })
  async categories() {
    return { items: await this.queries.categories() };
  }

  @Get("public/locations")
  @Public()
  @ApiOperation({
    operationId: "salons.listLocations",
    summary: "Provinces, or the wards of one province (Vietnam, post-2025 two-level model).",
  })
  @ApiResponse({ status: 200, description: "Locations.", standardSchema: locationListSchema })
  async locations(@Query({ schema: locationListQuerySchema }) query: LocationListQuery) {
    return { items: await this.queries.locations(query) };
  }

  @Post("salons/registrations")
  @Authenticated()
  @HttpCode(201)
  @ApiOperation({
    operationId: "salons.register",
    summary:
      "Signed-in only: create an organisation and a salon with full details; the caller becomes owner (scripted setups; the app uses quick-start).",
  })
  @ApiResponse({
    status: 201,
    description: "Registered.",
    standardSchema: salonRegistrationResultSchema,
  })
  @ApiResponse({ status: 400, description: "Invalid input.", standardSchema: problemSchema })
  @ApiResponse({ status: 429, description: "Rate limited.", standardSchema: problemSchema })
  async registerSalon(
    @Body({ schema: salonRegistrationInputSchema }) body: SalonRegistrationInput,
    @CurrentUser() user: UserPrincipal,
    @Req() req: Request,
  ): Promise<SalonRegistrationResult> {
    return this.register.execute(body, user, requestMeta(req));
  }

  @Post("salons/quick-start")
  @Authenticated()
  @HttpCode(200)
  @ApiOperation({
    operationId: "salons.quickStart",
    summary:
      "Email-only signup: create the caller's first salon as a draft with smart defaults (idempotent per user).",
  })
  @ApiResponse({
    status: 200,
    description: "The caller's salon (created now or earlier).",
    standardSchema: salonQuickStartResultSchema,
  })
  @ApiResponse({
    status: 409,
    description:
      "A team invitation exists for this email (`salon.invitation_pending`) or an old-form salon waits for confirmation.",
    standardSchema: problemSchema,
  })
  @ApiResponse({ status: 403, description: "Platform admin.", standardSchema: problemSchema })
  @ApiResponse({ status: 422, description: "Disposable email.", standardSchema: problemSchema })
  @ApiResponse({ status: 429, description: "Rate limited.", standardSchema: problemSchema })
  async quickStartSalon(
    @Body({ schema: salonQuickStartInputSchema }) body: SalonQuickStartInput,
    @CurrentUser() user: UserPrincipal,
    @Req() req: Request,
  ): Promise<SalonQuickStartResult> {
    return this.quickStart.execute(
      user,
      { locale: body.locale ?? "vi", ignoreInvitations: body.ignoreInvitations ?? false },
      requestMeta(req),
    );
  }

  @Get("salons/:salonId")
  @RequirePermission("salon.read")
  @ApiOperation({
    operationId: "salons.get",
    summary: "A salon the caller belongs to, with their role.",
  })
  @ApiResponse({ status: 200, description: "Salon.", standardSchema: salonSummarySchema })
  @ApiResponse({
    status: 404,
    description: "Not found or not a member.",
    standardSchema: problemSchema,
  })
  async get(
    @Param({ schema: salonParamsSchema }) _params: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<SalonSummary> {
    return this.queries.summary(salon);
  }

  @Patch("salons/:salonId")
  @RequirePermission("salon.profile.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salons.updateProfile",
    summary: "Update the salon's basic profile.",
  })
  @ApiResponse({ status: 204, description: "Updated." })
  @ApiResponse({ status: 403, description: "Permission required.", standardSchema: problemSchema })
  async update(
    @Param({ schema: salonParamsSchema }) _params: { salonId: string },
    @Body({ schema: updateSalonProfileInputSchema }) body: UpdateSalonProfileInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.updateProfile.execute(salon, body);
  }

  @Get("salons/:salonId/members")
  @RequirePermission("members.read")
  @ApiOperation({ operationId: "salons.listMembers", summary: "Team members of a salon." })
  @ApiResponse({ status: 200, description: "Members.", standardSchema: salonMemberListSchema })
  async members(
    @Param({ schema: salonParamsSchema }) _params: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<SalonMemberList> {
    return this.queries.members(salon);
  }
}
