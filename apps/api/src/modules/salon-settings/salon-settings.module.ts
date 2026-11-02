import { Module } from "@nestjs/common";
import { SalonSettingsService } from "./application/salon-settings.service";
import { SalonSettingsController } from "./http/salon-settings.controller";

/** Salon profile, booking/confirmation settings, policies, hours, holidays, onboarding (07). */
@Module({
  controllers: [SalonSettingsController],
  providers: [SalonSettingsService],
})
export class SalonSettingsModule {}
