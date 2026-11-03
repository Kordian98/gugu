import { forwardRef, Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.facade";
import { SalonSettingsService } from "./application/salon-settings.service";
import { SetupService } from "./application/setup.service";
import { SalonSettingsController } from "./http/salon-settings.controller";
import { SetupController } from "./http/setup.controller";

/**
 * Salon profile, booking/confirmation settings, policies, hours, holidays, onboarding checklist and
 * the guided setup after the email-only signup (07).
 */
@Module({
  // forwardRef: catalog imports the salon-settings facade (bumpAvailabilityVersion) at file level.
  imports: [forwardRef(() => CatalogModule)],
  controllers: [SalonSettingsController, SetupController],
  providers: [SalonSettingsService, SetupService],
})
export class SalonSettingsModule {}
