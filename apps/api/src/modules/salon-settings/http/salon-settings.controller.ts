import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type BookingSettings,
  bookingSettingsSchema,
  type Holiday,
  type HolidayInput,
  holidayInputSchema,
  holidayParamsSchema,
  holidaySchema,
  type Onboarding,
  onboardingSchema,
  type OpeningHours,
  openingHoursSchema,
  type PoliciesInput,
  policiesInputSchema,
  problemSchema,
  salonParamsSchema,
  type SalonProfileInput,
  salonProfileInputSchema,
  type SalonSettings,
  salonSettingsSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import { CurrentSalon, type SalonContext } from "../../../common/guards/principal";
import { SalonSettingsService } from "../application/salon-settings.service";

type SalonParams = { salonId: string };

@ApiTags("salon-settings")
@Controller("salons/:salonId")
export class SalonSettingsController {
  constructor(private readonly settings: SalonSettingsService) {}

  @Get("settings")
  @RequirePermission("salon.read")
  @ApiOperation({
    operationId: "salonSettings.get",
    summary: "Profile, booking settings, policies, hours, holidays.",
  })
  @ApiResponse({ status: 200, description: "Settings.", standardSchema: salonSettingsSchema })
  async get(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @CurrentSalon() salon: SalonContext,
  ): Promise<SalonSettings> {
    return this.settings.get(salon);
  }

  @Patch("settings/profile")
  @RequirePermission("salon.profile.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salonSettings.updateProfile",
    summary: "Name, phone, description, address.",
  })
  @ApiResponse({ status: 204, description: "Updated." })
  @ApiResponse({ status: 400, description: "Invalid input.", standardSchema: problemSchema })
  async profile(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: salonProfileInputSchema }) body: SalonProfileInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.settings.updateProfile(salon, body);
  }

  @Patch("settings/booking")
  @RequirePermission("salon.settings.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salonSettings.updateBooking",
    summary: "Confirmation mode (q13/q66), lead time, window, cut-offs.",
  })
  @ApiResponse({ status: 204, description: "Updated." })
  async booking(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: bookingSettingsSchema }) body: BookingSettings,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.settings.updateBooking(salon, body);
  }

  @Patch("settings/policies")
  @RequirePermission("salon.settings.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salonSettings.updatePolicies",
    summary: "Booking and cancellation policy texts (vi/en).",
  })
  @ApiResponse({ status: 204, description: "Updated." })
  async policies(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: policiesInputSchema }) body: PoliciesInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.settings.updatePolicies(salon, body);
  }

  @Patch("settings/opening-hours")
  @RequirePermission("salon.settings.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salonSettings.replaceOpeningHours",
    summary: "Replace the weekly opening hours.",
  })
  @ApiResponse({ status: 204, description: "Updated." })
  async openingHours(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: openingHoursSchema }) body: OpeningHours,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.settings.replaceOpeningHours(salon, body);
  }

  @Post("settings/holidays")
  @RequirePermission("salon.settings.write")
  @HttpCode(201)
  @ApiOperation({
    operationId: "salonSettings.addHoliday",
    summary: "Closed days or special hours.",
  })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: holidaySchema })
  async addHoliday(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: holidayInputSchema }) body: HolidayInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<Holiday> {
    return this.settings.addHoliday(salon, body);
  }

  @Delete("settings/holidays/:holidayId")
  @RequirePermission("salon.settings.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "salonSettings.removeHoliday", summary: "Remove a holiday." })
  @ApiResponse({ status: 204, description: "Removed." })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  async removeHoliday(
    @Param({ schema: holidayParamsSchema }) p: { salonId: string; holidayId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.settings.removeHoliday(salon, p.holidayId);
  }

  @Get("onboarding")
  @RequirePermission("salon.read")
  @ApiOperation({ operationId: "salonSettings.onboarding", summary: "Setup checklist progress." })
  @ApiResponse({ status: 200, description: "Progress.", standardSchema: onboardingSchema })
  async onboarding(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @CurrentSalon() salon: SalonContext,
  ): Promise<Onboarding> {
    return this.settings.onboarding(salon);
  }

  @Post("go-live")
  @RequirePermission("salon.settings.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "salonSettings.goLive",
    summary: "Activate the salon once setup is complete.",
  })
  @ApiResponse({ status: 204, description: "Live." })
  @ApiResponse({ status: 409, description: "Setup incomplete.", standardSchema: problemSchema })
  async goLive(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.settings.goLive(salon);
  }
}
