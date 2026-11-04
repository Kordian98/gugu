import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.facade";
import { QuickStartSalonCommand } from "./application/quick-start-salon.command";
import { SalonQueries } from "./application/salon.queries";
import { SignupGuard } from "./application/signup-guard";
import { UpdateSalonProfileCommand } from "./application/update-salon-profile.command";
import { SalonsController } from "./http/salons.controller";

/**
 * Salon signup (quick start through `SignupGuard`) and the minimal salon read models (topic 05 Step 3). The CRM workspace
 * (topic 07) builds on these tables in its own modules.
 */
@Module({
  imports: [AuthModule],
  controllers: [SalonsController],
  providers: [QuickStartSalonCommand, SalonQueries, SignupGuard, UpdateSalonProfileCommand],
})
export class SalonsModule {}
