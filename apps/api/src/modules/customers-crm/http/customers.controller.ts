import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  type CustomerDetail,
  customerDetailSchema,
  customerInputSchema,
  type CustomerList,
  type CustomerListQuery,
  customerListQuerySchema,
  customerListSchema,
  customerNoteInputSchema,
  customerNoteParamsSchema,
  customerParamsSchema,
  customerUpdateSchema,
  problemSchema,
  salonParamsSchema,
  uuidV7Schema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { CrmScopes } from "../../salon-crm/salon-crm.facade";
import { CustomersService } from "../application/customers.service";

type P = { salonId: string; customerId: string };

/**
 * Customers CRM (07 M7.7). Reads are gated by `schedules.read` and scoped like bookings
 * (customers.read = salon, customers.read.own = own appointments only); edits need customers.read,
 * notes need customers.notes.write. Notes are never part of a customer-facing response.
 */
@ApiTags("customers")
@Controller("salons/:salonId/customers")
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly scopes: CrmScopes,
  ) {}

  @Get()
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "customers.list",
    summary: "Client directory with visit statistics.",
  })
  @ApiResponse({ status: 200, description: "Clients.", standardSchema: customerListSchema })
  async list(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: customerListQuerySchema }) query: CustomerListQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<CustomerList> {
    const scope = await this.scopes.resolve(
      salon,
      user.userId,
      "customers.read",
      "customers.read.own",
    );
    return this.customers.list(salon, scope, query);
  }

  @Post()
  @RequirePermission("customers.read")
  @HttpCode(201)
  @ApiOperation({ operationId: "customers.create", summary: "Add a client (phone optional)." })
  @ApiResponse({
    status: 201,
    description: "Created.",
    standardSchema: z.object({ id: uuidV7Schema }),
  })
  @ApiResponse({
    status: 409,
    description: "Phone already a client.",
    standardSchema: problemSchema,
  })
  async create(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: customerInputSchema }) body: { displayName: string; phone: string | null },
    @CurrentSalon() salon: SalonContext,
  ): Promise<{ id: string }> {
    return this.customers.create(salon, body);
  }

  @Get(":customerId")
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "customers.get",
    summary: "Client profile, visits, notes (team-only).",
  })
  @ApiResponse({ status: 200, description: "Client.", standardSchema: customerDetailSchema })
  async get(
    @Param({ schema: customerParamsSchema }) p: P,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<CustomerDetail> {
    const scope = await this.scopes.resolve(
      salon,
      user.userId,
      "customers.read",
      "customers.read.own",
    );
    return this.customers.detail(salon, scope, p.customerId, user.userId);
  }

  @Patch(":customerId")
  @RequirePermission("customers.read")
  @HttpCode(204)
  @ApiOperation({ operationId: "customers.update", summary: "Name, tags, marketing consent." })
  @ApiResponse({ status: 204, description: "Updated." })
  async update(
    @Param({ schema: customerParamsSchema }) p: P,
    @Body({ schema: customerUpdateSchema }) body: z.infer<typeof customerUpdateSchema>,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.customers.update(salon, p.customerId, body);
  }

  @Post(":customerId/notes")
  @RequirePermission("customers.notes.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "customers.addNote", summary: "Add an internal note (team-only)." })
  @ApiResponse({ status: 204, description: "Added." })
  async addNote(
    @Param({ schema: customerParamsSchema }) p: P,
    @Body({ schema: customerNoteInputSchema }) body: { body: string },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    const scope = await this.scopes.resolve(
      salon,
      user.userId,
      "customers.read",
      "customers.read.own",
    );
    await this.customers.addNote(salon, scope, p.customerId, user.userId, body.body);
  }

  @Delete(":customerId/notes/:noteId")
  @RequirePermission("customers.notes.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "customers.deleteNote",
    summary: "Delete a note (author, owner, manager).",
  })
  @ApiResponse({ status: 204, description: "Deleted." })
  async deleteNote(
    @Param({ schema: customerNoteParamsSchema }) p: P & { noteId: string },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.customers.deleteNote(salon, p.customerId, p.noteId, user.userId);
  }
}
