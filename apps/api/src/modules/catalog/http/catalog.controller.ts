import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  problemSchema,
  type ReorderInput,
  reorderInputSchema,
  salonParamsSchema,
  type Service,
  serviceActiveInputSchema,
  type ServiceInputParsed,
  serviceInputSchema,
  type ServiceList,
  serviceListSchema,
  serviceParamsSchema,
  serviceSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import { CurrentSalon, type SalonContext } from "../../../common/guards/principal";
import { CatalogService } from "../application/catalog.service";

type ServiceParams = { salonId: string; serviceId: string };

@ApiTags("catalog")
@Controller("salons/:salonId/services")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermission("salon.read")
  @ApiOperation({
    operationId: "catalog.list",
    summary: "The salon's services with variants, add-ons and staff.",
  })
  @ApiResponse({ status: 200, description: "Services.", standardSchema: serviceListSchema })
  async list(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<ServiceList> {
    return this.catalog.list(salon);
  }

  @Post()
  @RequirePermission("services.write")
  @HttpCode(201)
  @ApiOperation({ operationId: "catalog.create", summary: "Create a service." })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: serviceSchema })
  @ApiResponse({ status: 400, description: "Invalid input.", standardSchema: problemSchema })
  async create(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: serviceInputSchema }) body: ServiceInputParsed,
    @CurrentSalon() salon: SalonContext,
  ): Promise<Service> {
    return this.catalog.create(salon, body);
  }

  @Patch("order")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "catalog.reorder",
    summary: "Set the display order of all services.",
  })
  @ApiResponse({ status: 204, description: "Reordered." })
  async reorder(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: reorderInputSchema }) body: ReorderInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.catalog.reorder(salon, body);
  }

  @Patch(":serviceId")
  @RequirePermission("services.write")
  @ApiOperation({
    operationId: "catalog.update",
    summary: "Replace a service (variants/add-ons by id).",
  })
  @ApiResponse({ status: 200, description: "Updated.", standardSchema: serviceSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  async update(
    @Param({ schema: serviceParamsSchema }) p: ServiceParams,
    @Body({ schema: serviceInputSchema }) body: ServiceInputParsed,
    @CurrentSalon() salon: SalonContext,
  ): Promise<Service> {
    return this.catalog.update(salon, p.serviceId, body);
  }

  @Patch(":serviceId/active")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "catalog.setActive", summary: "Activate or deactivate a service." })
  @ApiResponse({ status: 204, description: "Updated." })
  async setActive(
    @Param({ schema: serviceParamsSchema }) p: ServiceParams,
    @Body({ schema: serviceActiveInputSchema }) body: { isActive: boolean },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.catalog.setActive(salon, p.serviceId, body.isActive);
  }

  @Delete(":serviceId")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "catalog.remove",
    summary: "Remove a service (bookings keep snapshots).",
  })
  @ApiResponse({ status: 204, description: "Removed." })
  async remove(
    @Param({ schema: serviceParamsSchema }) p: ServiceParams,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.catalog.remove(salon, p.serviceId);
  }
}
