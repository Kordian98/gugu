import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  AI_IMPORT_MAX_IMAGE_BYTES,
  AI_IMPORT_MAX_IMAGES,
  type AiImportConfirmInputParsed,
  aiImportConfirmInputSchema,
  type AiImportConfirmResult,
  aiImportConfirmResultSchema,
  type AiImportExtractResult,
  aiImportExtractResultSchema,
  type AiImportStatus,
  aiImportStatusSchema,
  problemSchema,
  salonParamsSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import { CurrentSalon, type SalonContext } from "../../../common/guards/principal";
import { RequiresEntitlement } from "../../subscriptions/subscriptions.facade";
import { AiImportService, type UploadedImage } from "../application/ai-import.service";

/** AI onboarding import (topic 08 IMP): price-list images → draft services → confirmed services. */
@ApiTags("ai-import")
@Controller("salons/:salonId/ai-import")
export class AiImportController {
  constructor(private readonly service: AiImportService) {}

  @Get()
  @RequirePermission("services.write")
  @ApiOperation({
    operationId: "aiImport.status",
    summary: "Whether AI import is configured and included in the plan, and this month's AI spend.",
  })
  @ApiResponse({ status: 200, description: "Status.", standardSchema: aiImportStatusSchema })
  async status(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<AiImportStatus> {
    return this.service.status(salon);
  }

  @Post("extract")
  @RequirePermission("services.write")
  @RequiresEntitlement("ai.onboarding_import")
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor("images", AI_IMPORT_MAX_IMAGES, {
      limits: { fileSize: AI_IMPORT_MAX_IMAGE_BYTES, files: AI_IMPORT_MAX_IMAGES, fields: 0 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { images: { type: "array", items: { type: "string", format: "binary" } } },
      required: ["images"],
    },
  })
  @ApiOperation({
    operationId: "aiImport.extract",
    summary:
      "Read 1–10 price-list images into draft services. Images are redacted on the server (faces, phone numbers, emails, links, names) before one AI call, and are not stored.",
  })
  @ApiResponse({ status: 200, description: "Drafts.", standardSchema: aiImportExtractResultSchema })
  @ApiResponse({ status: 400, description: "Bad upload.", standardSchema: problemSchema })
  @ApiResponse({
    status: 422,
    description: "Image unreadable, shows a person, or failed the privacy check.",
    standardSchema: problemSchema,
  })
  @ApiResponse({
    status: 429,
    description: "Monthly AI cap or rate limit.",
    standardSchema: problemSchema,
  })
  @ApiResponse({ status: 502, description: "AI extraction failed.", standardSchema: problemSchema })
  @ApiResponse({ status: 503, description: "Not configured.", standardSchema: problemSchema })
  async extract(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @UploadedFiles() files: UploadedImage[] | undefined,
    @CurrentSalon() salon: SalonContext,
  ): Promise<AiImportExtractResult> {
    return this.service.extract(salon, files ?? []);
  }

  @Post("confirm")
  @RequirePermission("services.write")
  @RequiresEntitlement("ai.onboarding_import")
  @HttpCode(201)
  @ApiOperation({
    operationId: "aiImport.confirm",
    summary: "Create the reviewed services (through the catalogue).",
  })
  @ApiResponse({
    status: 201,
    description: "Created.",
    standardSchema: aiImportConfirmResultSchema,
  })
  @ApiResponse({ status: 400, description: "Invalid rows.", standardSchema: problemSchema })
  async confirm(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: aiImportConfirmInputSchema }) body: AiImportConfirmInputParsed,
    @CurrentSalon() salon: SalonContext,
  ): Promise<AiImportConfirmResult> {
    return this.service.confirm(salon, body);
  }
}
