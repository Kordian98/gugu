import { Body, Controller, Get, Param, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  bookingParamsSchema,
  type ClientLookupQuery as ClientLookupQueryInput,
  clientLookupQuerySchema,
  clientSuggestionListSchema,
  type OfflineSale,
  offlineSaleInputSchema,
  offlineSaleSchema,
  problemSchema,
  salonParamsSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { ClientLookupQuery } from "../application/client-lookup.query";
import { OfflineSaleService } from "../application/offline-sale.service";

type BookingParams = { salonId: string; bookingId: string };

@ApiTags("salon-crm")
@Controller("salons/:salonId")
export class SalonCrmController {
  constructor(
    private readonly clients: ClientLookupQuery,
    private readonly sales: OfflineSaleService,
  ) {}

  @Get("clients/lookup")
  @RequirePermission("customers.read")
  @ApiOperation({
    operationId: "salonCrm.lookupClients",
    summary: "Recent clients of this salon by phone or name.",
  })
  @ApiResponse({
    status: 200,
    description: "Suggestions.",
    standardSchema: clientSuggestionListSchema,
  })
  async lookup(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: clientLookupQuerySchema }) query: ClientLookupQueryInput,
    @CurrentSalon() salon: SalonContext,
  ) {
    return { items: await this.clients.find(salon, query.q) };
  }

  @Get("bookings/:bookingId/offline-sale")
  @RequirePermission("bookings.read")
  @ApiOperation({
    operationId: "salonCrm.getOfflineSale",
    summary: "Amount received recorded for a booking.",
  })
  @ApiResponse({ status: 200, description: "Recorded amount.", standardSchema: offlineSaleSchema })
  @ApiResponse({ status: 404, description: "Nothing recorded.", standardSchema: problemSchema })
  async getSale(
    @Param({ schema: bookingParamsSchema }) p: BookingParams,
    @CurrentSalon() salon: SalonContext,
  ): Promise<OfflineSale> {
    return this.sales.get(salon, p.bookingId);
  }

  @Put("bookings/:bookingId/offline-sale")
  @RequirePermission("bookings.write")
  @ApiOperation({
    operationId: "salonCrm.recordOfflineSale",
    summary: "Record the amount received at the salon (optional).",
  })
  @ApiResponse({ status: 200, description: "Recorded.", standardSchema: offlineSaleSchema })
  @ApiResponse({
    status: 409,
    description: "Booking not completed.",
    standardSchema: problemSchema,
  })
  async recordSale(
    @Param({ schema: bookingParamsSchema }) p: BookingParams,
    @Body({ schema: offlineSaleInputSchema })
    body: { amount: number; method: OfflineSale["method"]; note?: string | null },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<OfflineSale> {
    return this.sales.record(salon, user.userId, p.bookingId, body);
  }
}
