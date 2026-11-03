import { Module } from "@nestjs/common";
import { ClientLookupQuery } from "./application/client-lookup.query";
import { CrmScopes } from "./application/crm-scope";
import { OfflineSaleService } from "./application/offline-sale.service";
import { PayrollController } from "./http/payroll.controller";
import { SalonCrmController } from "./http/salon-crm.controller";
import { PaySettingsService } from "./payroll/pay-settings.service";
import { PayrollClock, PayrollData } from "./payroll/payroll-data";
import { PayrollService } from "./payroll/payroll.service";
import { SalonCostsService } from "./payroll/salon-costs.service";

/**
 * CRM helpers around bookings: client quick pick and offline sale amounts (07 M7.2), plus staff
 * pay, payroll and fixed costs (ADR-0016). Insights builds the profit view on the payroll exports.
 */
@Module({
  controllers: [SalonCrmController, PayrollController],
  providers: [
    ClientLookupQuery,
    OfflineSaleService,
    CrmScopes,
    PayrollClock,
    PayrollData,
    PayrollService,
    PaySettingsService,
    SalonCostsService,
  ],
  exports: [CrmScopes, PayrollClock, PayrollData, PayrollService, SalonCostsService],
})
export class SalonCrmModule {}
