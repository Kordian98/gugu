import { Module } from "@nestjs/common";
import { SalonSettingsService } from "./application/salon-settings.service";
import { SetupService } from "./application/setup.service";
import { SalonSettingsController } from "./http/salon-settings.controller";
import { SetupController } from "./http/setup.controller";

/**
 * Salon profile, booking/confirmation settings, policies, hours, holidays, onboarding checklist and
 * the guided setup after the email-only signup (07).
 */
@Module({
  controllers: [SalonSettingsController, SetupController],
  providers: [SalonSettingsService, SetupService],
})
export class SalonSettingsModule {}
