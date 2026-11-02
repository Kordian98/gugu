import { Module } from "@nestjs/common";
import { SalonCrmModule } from "../salon-crm/salon-crm.facade";
import { CustomersService } from "./application/customers.service";
import { CustomersController } from "./http/customers.controller";

/** Customers directory, profiles, tags, consent and internal notes (07 M7.7). */
@Module({
  imports: [SalonCrmModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersCrmModule {}
