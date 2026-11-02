import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type CreateResourceInput,
  createResourceInputSchema,
  type CreateResourceTypeInput,
  createResourceTypeInputSchema,
  problemSchema,
  type ReplaceServiceResourceRequirementsInput,
  replaceServiceResourceRequirementsInputSchema,
  resourceParamsSchema,
  type ResourceTypeList,
  resourceTypeListSchema,
  resourceTypeParamsSchema,
  salonParamsSchema,
  serviceResourceParamsSchema,
  serviceResourceRequirementsSchema,
  type UpdateResourceInput,
  updateResourceInputSchema,
  type UpdateResourceTypeInput,
  updateResourceTypeInputSchema,
} from "@gugu/contracts";
import { z } from "zod";
import { RequirePermission } from "../../../common/guards/auth-policy";
import { CurrentSalon, type SalonContext } from "../../../common/guards/principal";
import { ResourcesService } from "../application/resources.service";

const createdSchema = z.object({ id: z.string() });

/**
 * Rooms, chairs, beds and equipment (topic 06 M6.6). Reads for every salon role (the calendar and
 * booking form show them); writes are catalog setup (`services.write`, owner/manager).
 */
@ApiTags("resources")
@Controller("salons/:salonId")
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get("resource-types")
  @RequirePermission("schedules.read")
  @ApiOperation({ operationId: "resources.list", summary: "Resource types with their resources." })
  @ApiResponse({ status: 200, description: "Types.", standardSchema: resourceTypeListSchema })
  list(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<ResourceTypeList> {
    return this.resources.list(salon);
  }

  @Post("resource-types")
  @RequirePermission("services.write")
  @HttpCode(201)
  @ApiOperation({ operationId: "resources.createType", summary: "Add a resource type." })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: createdSchema })
  createType(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: createResourceTypeInputSchema }) body: CreateResourceTypeInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<{ id: string }> {
    return this.resources.createType(salon, body);
  }

  @Patch("resource-types/:resourceTypeId")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "resources.updateType", summary: "Rename or reorder a type." })
  @ApiResponse({ status: 204, description: "Updated." })
  async updateType(
    @Param({ schema: resourceTypeParamsSchema }) p: { salonId: string; resourceTypeId: string },
    @Body({ schema: updateResourceTypeInputSchema }) body: UpdateResourceTypeInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.resources.updateType(salon, p.resourceTypeId, body);
  }

  @Delete("resource-types/:resourceTypeId")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "resources.deleteType", summary: "Delete an unused type." })
  @ApiResponse({ status: 204, description: "Deleted." })
  @ApiResponse({ status: 409, description: "Still in use.", standardSchema: problemSchema })
  async deleteType(
    @Param({ schema: resourceTypeParamsSchema }) p: { salonId: string; resourceTypeId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.resources.deleteType(salon, p.resourceTypeId);
  }

  @Post("resources")
  @RequirePermission("services.write")
  @HttpCode(201)
  @ApiOperation({ operationId: "resources.create", summary: "Add a resource with a capacity." })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: createdSchema })
  createResource(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: createResourceInputSchema }) body: CreateResourceInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<{ id: string }> {
    return this.resources.createResource(salon, body);
  }

  @Patch("resources/:resourceId")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "resources.update", summary: "Rename, resize, pause or reorder." })
  @ApiResponse({ status: 204, description: "Updated." })
  @ApiResponse({ status: 409, description: "Units have bookings.", standardSchema: problemSchema })
  async updateResource(
    @Param({ schema: resourceParamsSchema }) p: { salonId: string; resourceId: string },
    @Body({ schema: updateResourceInputSchema }) body: UpdateResourceInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.resources.updateResource(salon, p.resourceId, body);
  }

  @Delete("resources/:resourceId")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "resources.delete", summary: "Delete a resource without bookings." })
  @ApiResponse({ status: 204, description: "Deleted." })
  @ApiResponse({ status: 409, description: "Upcoming bookings.", standardSchema: problemSchema })
  async deleteResource(
    @Param({ schema: resourceParamsSchema }) p: { salonId: string; resourceId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.resources.deleteResource(salon, p.resourceId);
  }

  @Get("services/:serviceId/resource-requirements")
  @RequirePermission("schedules.read")
  @ApiOperation({ operationId: "resources.requirements", summary: "Resources a service needs." })
  @ApiResponse({
    status: 200,
    description: "Requirements.",
    standardSchema: serviceResourceRequirementsSchema,
  })
  async requirements(
    @Param({ schema: serviceResourceParamsSchema }) p: { salonId: string; serviceId: string },
    @CurrentSalon() salon: SalonContext,
  ) {
    return { items: await this.resources.requirements(salon, p.serviceId) };
  }

  @Put("services/:serviceId/resource-requirements")
  @RequirePermission("services.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "resources.replaceRequirements",
    summary: "Replace the resources a service needs.",
  })
  @ApiResponse({ status: 204, description: "Replaced." })
  async replaceRequirements(
    @Param({ schema: serviceResourceParamsSchema }) p: { salonId: string; serviceId: string },
    @Body({ schema: replaceServiceResourceRequirementsInputSchema })
    body: ReplaceServiceResourceRequirementsInput,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.resources.replaceRequirements(salon, p.serviceId, body.items);
  }
}
