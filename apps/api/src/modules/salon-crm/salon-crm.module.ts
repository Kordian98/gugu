import { Module } from "@nestjs/common";
import { ClientLookupQuery } from "./application/client-lookup.query";
import { CrmScopes } from "./application/crm-scope";
import { OfflineSaleService } from "./application/offline-sale.service";
import { SalonCrmController } from "./http/salon-crm.controller";

/** CRM helpers around bookings: client quick pick and offline sale amounts (07 M7.2). */
@Module({
  controllers: [SalonCrmController],
  providers: [ClientLookupQuery, OfflineSaleService, CrmScopes],
})
export class SalonCrmModule {}
