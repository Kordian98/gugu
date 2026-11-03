import { gunzipSync, gzipSync } from "node:zlib";
import { Injectable, Logger } from "@nestjs/common";
import {
  PRIVACY_ERRORS,
  PRIVACY_EXPORT_TTL_HOURS,
  type SalonExport,
  type SalonExportDownload,
  type SalonExportList,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import type { PrivacyExport } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../../infrastructure/queue/queue.service";
import { QUEUES } from "../../../infrastructure/queue/queues";
import {
  type RateLimitRule,
  RateLimitService,
} from "../../../infrastructure/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.facade";
import { renderClientsCsv } from "../domain/render-export";
import { buildClientExport, loadClientScope } from "./client-data";

export const PRIVACY_JOBS = {
  salonExport: "privacy.salon_export",
  retention: "privacy.retention",
} as const;

/** Salon-wide exports per salon per day (they scan every client). */
export const SALON_EXPORT_RULE: RateLimitRule = {
  name: "privacy.salon_export.salon",
  limit: 3,
  windowSeconds: 86_400,
};

const PAGE = 200;

/**
 * Salon-wide client data export (owner, `customers.export`), built by the `privacy` worker. The
 * files are stored gzipped in `privacy_exports` and can be downloaded only through the
 * authenticated panel (no signed public link, nothing emailed) until they expire after
 * PRIVACY_EXPORT_TTL_HOURS; the retention job then purges the content.
 */
@Injectable()
export class SalonExportService {
  private readonly logger = new Logger(SalonExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queues: QueueService,
    private readonly limits: RateLimitService,
  ) {}

  async list(ctx: SalonContext): Promise<SalonExportList> {
    const rows = await this.prisma.privacyExport.findMany({
      where: { salonId: ctx.salonId },
      orderBy: { createdAt: "desc" },
      take: 10,
      omit: { jsonGz: true, csvGz: true },
    });
    return { items: rows.map(toDto) };
  }

  async request(ctx: SalonContext, userId: string): Promise<SalonExport> {
    const inFlight = await this.prisma.privacyExport.findFirst({
      where: { salonId: ctx.salonId, status: { in: ["queued", "running"] } },
      select: { id: true },
    });
    if (inFlight) throw inProgress();
    await this.limits.consume(SALON_EXPORT_RULE, ctx.salonId);
    let row: Omit<PrivacyExport, "jsonGz" | "csvGz">;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.privacyExport.create({
          data: { salonId: ctx.salonId, requestedByUserId: userId },
          omit: { jsonGz: true, csvGz: true },
        });
        await this.audit.record(
          {
            action: "privacy.salon_export_requested",
            salonId: ctx.salonId,
            organizationId: ctx.organizationId,
            targetType: "privacy_export",
            targetId: created.id,
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      // Partial unique index privacy_exports_one_in_flight lost a race with a parallel request.
      if ((error as { code?: string }).code === "P2002") throw inProgress();
      throw error;
    }
    await this.queues.add(
      QUEUES.privacy,
      PRIVACY_JOBS.salonExport,
      { exportId: row.id },
      { jobId: `export-${row.id}` },
    );
    return toDto(row);
  }

  async download(
    ctx: SalonContext,
    exportId: string,
    format: "json" | "csv",
  ): Promise<SalonExportDownload> {
    const row = await this.prisma.privacyExport.findFirst({
      where: { id: exportId, salonId: ctx.salonId },
    });
    if (!row) throw new AppError(404, PRIVACY_ERRORS.exportNotFound, "Export not found");
    const content = format === "json" ? row.jsonGz : row.csvGz;
    if (row.status !== "ready" || !content || !row.expiresAt || row.expiresAt <= new Date()) {
      throw new AppError(409, PRIVACY_ERRORS.exportUnavailable, "Export not available");
    }
    await this.audit.record({
      action: "privacy.salon_export_downloaded",
      salonId: ctx.salonId,
      organizationId: ctx.organizationId,
      targetType: "privacy_export",
      targetId: row.id,
      metadata: { format },
    });
    const day = row.createdAt.toISOString().slice(0, 10);
    return {
      fileName: `gugu-salon-export-${day}.${format}`,
      mimeType: format === "json" ? "application/json" : "text/csv",
      content: gunzipSync(content).toString("utf8"),
    };
  }

  /** Worker: builds the files. Idempotent — a retried job on a finished export does nothing. */
  async run(exportId: string): Promise<{ status: string }> {
    const claimed = await this.prisma.privacyExport.updateMany({
      where: { id: exportId, status: { in: ["queued", "running"] } },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) return { status: "skipped" };
    const row = await this.prisma.privacyExport.findUniqueOrThrow({
      where: { id: exportId },
      select: { salonId: true },
    });
    try {
      const built = await this.build(row.salonId);
      const json = gzipSync(Buffer.from(built.json, "utf8"));
      const csv = gzipSync(Buffer.from(built.csv, "utf8"));
      const now = new Date();
      await this.prisma.privacyExport.updateMany({
        where: { id: exportId, status: "running" },
        data: {
          status: "ready",
          jsonGz: json,
          csvGz: csv,
          sizeBytes: json.length + csv.length,
          clients: built.clients,
          bookings: built.bookings,
          completedAt: now,
          expiresAt: new Date(now.getTime() + PRIVACY_EXPORT_TTL_HOURS * 3600_000),
        },
      });
      return { status: "ready" };
    } catch (error) {
      this.logger.error({ exportId, err: (error as Error).message }, "salon export failed");
      await this.prisma.privacyExport.updateMany({
        where: { id: exportId, status: "running" },
        data: { status: "failed", error: "build_failed", completedAt: new Date() },
      });
      return { status: "failed" };
    }
  }

  /**
   * Every client of the salon (same shape as the one-client export, under `clients[]`), plus
   * bookings that belong to no client profile (walk-ins, phone-less) so nothing is left out.
   */
  private async build(salonId: string) {
    const salon = await this.prisma.salon.findUniqueOrThrow({
      where: { id: salonId },
      select: { id: true, name: true },
    });
    const now = new Date();
    const clients = [];
    const csvRows = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.customerSalonProfile.findMany({
        where: { salonId, deletedAt: null, mergedIntoId: null },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      });
      if (page.length === 0) break;
      for (const p of page) {
        const one = await this.prisma.$transaction(async (tx) => {
          const scope = await loadClientScope(tx, salonId, p.id);
          return scope ? buildClientExport(tx, salon, scope, now) : null;
        });
        if (!one) continue;
        const completed = one.bookings.filter((b) => b.status === "completed");
        csvRows.push({
          displayName: one.client.displayName,
          phone: one.client.phone,
          tags: one.client.tags,
          consent: one.client.marketingConsent,
          visits: completed.length,
          lastVisitAt: completed.at(-1)?.startsAt ?? null,
          createdAt: one.client.createdAt,
        });
        clients.push({
          client: one.client,
          bookings: one.bookings,
          notes: one.notes,
          zalo: one.zalo,
        });
      }
      cursor = page.at(-1)?.id;
    }
    const total = await this.prisma.booking.count({ where: { salonId } });
    // Bookings no client profile covers (no phone, or a phone without a live profile).
    const other = await this.prisma.$queryRaw<
      {
        id: string;
        reference_code: string;
        status: string;
        starts_at: Date;
        customer_name: string | null;
        customer_phone_e164: string | null;
        total_price_minor: bigint;
      }[]
    >`
      SELECT b.id, b.reference_code, b.status::text AS status, b.starts_at, b.customer_name,
             b.customer_phone_e164, b.total_price_minor
      FROM bookings b
      WHERE b.salon_id = ${salonId}::uuid
        AND (b.customer_phone_e164 IS NULL OR NOT EXISTS (
          SELECT 1 FROM customer_salon_profiles p
          WHERE p.salon_id = b.salon_id AND p.phone_e164 = b.customer_phone_e164
            AND p.deleted_at IS NULL))
      ORDER BY b.starts_at`;
    const json = JSON.stringify(
      {
        format: "gugu.salon-export.v1",
        exportedAt: now.toISOString(),
        salon,
        clients,
        bookingsWithoutClient: other.map((b) => ({
          id: b.id,
          referenceCode: b.reference_code,
          status: b.status,
          startsAt: b.starts_at.toISOString(),
          customerName: b.customer_name,
          customerPhone: b.customer_phone_e164,
          totalPriceMinor: Number(b.total_price_minor),
        })),
      },
      null,
      2,
    );
    return { json, csv: renderClientsCsv(csvRows, "vi"), clients: clients.length, bookings: total };
  }
}

function toDto(row: Omit<PrivacyExport, "jsonGz" | "csvGz">): SalonExport {
  const expired = row.status === "ready" && row.expiresAt !== null && row.expiresAt <= new Date();
  return {
    id: row.id,
    status: expired ? "expired" : row.status,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.status === "ready" ? (row.expiresAt?.toISOString() ?? null) : null,
    clients: row.clients,
    bookings: row.bookings,
    sizeBytes: row.sizeBytes,
  };
}

const inProgress = () =>
  new AppError(409, PRIVACY_ERRORS.exportInProgress, "An export is already being created");
