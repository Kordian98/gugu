import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  type ClientEraseResult,
  clientEraseInputSchema,
  clientEraseResultSchema,
  clientExportInputSchema,
  type ClientExportResult,
  clientExportResultSchema,
  customerParamsSchema,
  privacyExportParamsSchema,
  problemSchema,
  salonExportDownloadQuerySchema,
  type SalonExportDownload,
  salonExportDownloadSchema,
  type SalonExport,
  type SalonExportList,
  salonExportListSchema,
  salonExportSchema,
  salonParamsSchema,
} from "@gugu/contracts";
import { AllowWhileSuspended, RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { ClientPrivacyService } from "../application/client-privacy.service";
import { SalonExportService } from "../application/salon-export.service";

type ClientParams = { salonId: string; customerId: string };

/**
 * Privacy tools for salon owners (topic 05 step 8, q80): the salon answers its clients' requests.
 * Owner-only permissions (`customers.export`, `customers.erase`, never grantable). Tenant scope
 * comes from the guard's SalonContext; another salon's client or export is a 404. Everything is
 * audited with counts only. Erasure and the salon export stay available while GuGu suspends the
 * salon (q92, `@AllowWhileSuspended`); every other salon write is refused then. GuGu Studio is
 * designed to support such requests; no compliance claim.
 */
@ApiTags("privacy")
@Controller("salons/:salonId")
export class PrivacyController {
  constructor(
    private readonly clients: ClientPrivacyService,
    private readonly exports: SalonExportService,
  ) {}

  @Get("customers/:customerId/export")
  @RequirePermission("customers.export")
  @ApiOperation({
    operationId: "privacy.exportClient",
    summary:
      "Export one client's data: profile, bookings, notes, Zalo chat, notification log (JSON + readable text). Audited.",
  })
  @ApiResponse({ status: 200, description: "Export.", standardSchema: clientExportResultSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  exportClient(
    @Param({ schema: customerParamsSchema }) p: ClientParams,
    @Query({ schema: clientExportInputSchema }) q: z.infer<typeof clientExportInputSchema>,
    @CurrentSalon() salon: SalonContext,
  ): Promise<ClientExportResult> {
    return this.clients.export(salon, p.customerId, q.locale);
  }

  @Post("customers/:customerId/erase")
  @HttpCode(200)
  @RequirePermission("customers.erase")
  // q92: the owner can still answer a client's erasure request while GuGu suspends the salon.
  @AllowWhileSuspended()
  @ApiOperation({
    operationId: "privacy.eraseClient",
    summary:
      "Irreversibly delete a client's data on request; bookings stay anonymised, upcoming ones are cancelled. Audited.",
  })
  @ApiResponse({ status: 200, description: "Erased.", standardSchema: clientEraseResultSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  erase(
    @Param({ schema: customerParamsSchema }) p: ClientParams,
    @Body({ schema: clientEraseInputSchema }) _body: z.infer<typeof clientEraseInputSchema>,
    @CurrentSalon() salon: SalonContext,
  ): Promise<ClientEraseResult> {
    return this.clients.erase(salon, p.customerId);
  }

  @Get("privacy/exports")
  @RequirePermission("customers.export")
  @ApiOperation({ operationId: "privacy.listExports", summary: "Recent salon-wide exports." })
  @ApiResponse({ status: 200, description: "Exports.", standardSchema: salonExportListSchema })
  list(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<SalonExportList> {
    return this.exports.list(salon);
  }

  @Post("privacy/exports")
  @HttpCode(202)
  @RequirePermission("customers.export")
  // q92: the salon-wide export can still be started (and downloaded, a GET) while suspended.
  @AllowWhileSuspended()
  @ApiOperation({
    operationId: "privacy.requestExport",
    summary: "Start a salon-wide client data export (async; one at a time, 3 per day).",
  })
  @ApiResponse({ status: 202, description: "Queued.", standardSchema: salonExportSchema })
  @ApiResponse({ status: 409, description: "One in progress.", standardSchema: problemSchema })
  @ApiResponse({ status: 429, description: "Daily limit.", standardSchema: problemSchema })
  request(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SalonExport> {
    return this.exports.request(salon, user.userId);
  }

  @Get("privacy/exports/:exportId/download")
  @RequirePermission("customers.export")
  @ApiOperation({
    operationId: "privacy.downloadExport",
    summary: "Download a ready export (panel only, until it expires after 24 h). Audited.",
  })
  @ApiResponse({ status: 200, description: "File.", standardSchema: salonExportDownloadSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  @ApiResponse({ status: 409, description: "Not ready or expired.", standardSchema: problemSchema })
  download(
    @Param({ schema: privacyExportParamsSchema }) p: { salonId: string; exportId: string },
    @Query({ schema: salonExportDownloadQuerySchema }) q: { format: "json" | "csv" },
    @CurrentSalon() salon: SalonContext,
  ): Promise<SalonExportDownload> {
    return this.exports.download(salon, p.exportId, q.format);
  }
}
