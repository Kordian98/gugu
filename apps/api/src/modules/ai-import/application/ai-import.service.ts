import { Injectable } from "@nestjs/common";
import {
  AI_IMPORT_ACCEPTED_TYPES,
  AI_IMPORT_ERRORS,
  AI_IMPORT_MAX_IMAGE_BYTES,
  AI_IMPORT_MAX_IMAGES,
  type AiImportConfirmInputParsed,
  type AiImportConfirmResult,
  type AiImportExtractResult,
  type AiImportStatus,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import {
  type RateLimitRule,
  RateLimitService,
} from "../../../infrastructure/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.facade";
import { CatalogService } from "../../catalog/catalog.facade";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";
import { costVnd } from "../llm/models";
import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  estimateInputTokens,
  ExtractionFailed,
  PriceListExtractor,
  ProviderCallFailed,
} from "../llm/price-list-extractor";
import { type GatedImage, ImageGate } from "../pii/image-gate";
import { AiCostMeter } from "./ai-cost-meter";

/** OCR and face detection run on our CPUs before any cost is reserved; bound them per salon. */
export const AI_IMPORT_RATE_LIMIT: RateLimitRule = {
  name: "ai_import.extract.salon",
  limit: 20,
  windowSeconds: 3600,
};

/** Provider attempts per extraction (the SDK's own retries are off so each attempt is metered). */
export const EXTRACTION_MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 1_500;

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * AI onboarding import (topic 08 milestone IMP, every plan). Flow: validate upload → no-PII gate on
 * every image → reserve the worst-case cost against the hard monthly cap → one Claude call → commit
 * the actual cost → return draft rows. Nothing is saved until the owner confirms the reviewed rows,
 * which are created through the catalogue service. Images are processed in memory and never stored.
 */
@Injectable()
export class AiImportService {
  constructor(
    private readonly gate: ImageGate,
    private readonly extractor: PriceListExtractor,
    private readonly meter: AiCostMeter,
    private readonly entitlements: EntitlementService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly rateLimits: RateLimitService,
  ) {}

  async status(ctx: SalonContext): Promise<AiImportStatus> {
    const [entitled, usage] = await Promise.all([
      this.entitlements.isEnabled(ctx.salonId, "ai.onboarding_import"),
      this.meter.usage(ctx.salonId),
    ]);
    return {
      configured: this.extractor.configured,
      entitled,
      maxImages: AI_IMPORT_MAX_IMAGES,
      usage,
    };
  }

  async extract(ctx: SalonContext, files: UploadedImage[]): Promise<AiImportExtractResult> {
    if (!this.extractor.configured) {
      throw new AppError(503, AI_IMPORT_ERRORS.notConfigured, "AI import is not configured");
    }
    await this.entitlements.assert(ctx.salonId, "ai.onboarding_import");
    validateUpload(files);
    await this.rateLimits.consume(AI_IMPORT_RATE_LIMIT, ctx.salonId);

    const gated: GatedImage[] = [];
    for (const [i, file] of files.entries()) {
      try {
        gated.push(await this.gate.process(file.buffer, i + 1));
      } catch (error) {
        if (error instanceof AppError)
          await this.recordBlocked(ctx, error.code, i + 1, files.length);
        throw error;
      }
    }

    const fx = this.config.env.AI_USD_TO_VND;
    const worstCase = costVnd(
      EXTRACTION_MODEL,
      {
        inputTokens: estimateInputTokens(gated.length),
        outputTokens: EXTRACTION_MAX_TOKENS,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      fx,
    );
    const result = await this.extractMetered(ctx, gated, worstCase, files.length);
    const spentVnd = costVnd(result.model, result.usage, fx);
    await this.audit.record({
      action: "ai_import.extracted",
      salonId: ctx.salonId,
      organizationId: ctx.organizationId,
      targetType: "salon",
      targetId: ctx.salonId,
      metadata: {
        images: gated.length,
        services: result.items.length,
        redactedRegions: sum(gated.map((g) => g.redactedRegions)),
        maskedFaces: sum(gated.map((g) => g.maskedFaces)),
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costVnd: spentVnd,
      },
    });
    return {
      items: result.items,
      images: gated.map((g, i) => ({
        index: i + 1,
        redactedRegions: g.redactedRegions,
        maskedFaces: g.maskedFaces,
      })),
      usage: await this.meter.usage(ctx.salonId),
    };
  }

  /**
   * One metered attempt per provider request (the SDK does not retry): reserve the worst case,
   * then commit the actual usage on success, the actual usage on an unusable answer, the reserved
   * worst case when the request may have been billed (timeout, abort, 5xx, dropped connection), and
   * release only when it provably was not (never sent, or rejected with a 4xx).
   */
  private async extractMetered(
    ctx: SalonContext,
    gated: GatedImage[],
    worstCaseVnd: number,
    images: number,
  ) {
    const fx = this.config.env.AI_USD_TO_VND;
    for (let attempt = 1; ; attempt++) {
      const reservation = await this.meter.reserve(ctx.salonId, worstCaseVnd);
      try {
        const result = await this.extractor.extract(gated);
        await this.meter.commit(reservation, costVnd(result.model, result.usage, fx));
        return result;
      } catch (error) {
        if (error instanceof ExtractionFailed) {
          const spent = costVnd(EXTRACTION_MODEL, error.usage, fx);
          await this.meter.commit(reservation, spent);
          await this.recordBlocked(ctx, `${error.code}:${error.reason}`, 0, images, spent);
          throw error;
        }
        const failure =
          error instanceof ProviderCallFailed
            ? error.failure
            : { billing: "maybe_billed" as const, retryable: false };
        const charged = failure.billing === "maybe_billed" ? reservation.amountVnd : 0;
        if (charged > 0) await this.meter.commit(reservation, charged);
        else await this.meter.release(reservation);
        if (!failure.retryable || attempt >= EXTRACTION_MAX_ATTEMPTS) {
          await this.recordBlocked(
            ctx,
            `${AI_IMPORT_ERRORS.extractionFailed}:provider_${failure.billing}`,
            0,
            images,
            charged,
          );
          throw error;
        }
        await this.pause(RETRY_BACKOFF_MS * attempt);
      }
    }
  }

  /** Backoff between attempts; overridable in tests. */
  protected pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Creates the reviewed services through the catalogue (its validation, audit and availability
   * bump apply). Rows are created in order; on a failure the error names the row and the earlier
   * rows stay created (the owner sees them in Services).
   */
  async confirm(
    ctx: SalonContext,
    input: AiImportConfirmInputParsed,
  ): Promise<AiImportConfirmResult> {
    await this.entitlements.assert(ctx.salonId, "ai.onboarding_import");
    const serviceIds: string[] = [];
    try {
      for (const item of input.items) {
        serviceIds.push((await this.catalog.create(ctx, item)).id);
      }
    } finally {
      await this.audit.record({
        action: "ai_import.confirmed",
        salonId: ctx.salonId,
        organizationId: ctx.organizationId,
        targetType: "salon",
        targetId: ctx.salonId,
        metadata: { requested: input.items.length, created: serviceIds.length },
      });
    }
    return { created: serviceIds.length, serviceIds };
  }

  private recordBlocked(
    ctx: SalonContext,
    reason: string,
    image: number,
    images: number,
    costVndSpent = 0,
  ) {
    return this.audit.record({
      action: "ai_import.blocked",
      salonId: ctx.salonId,
      organizationId: ctx.organizationId,
      targetType: "salon",
      targetId: ctx.salonId,
      metadata: { reason, image, images, costVnd: costVndSpent },
    });
  }
}

function validateUpload(files: UploadedImage[]): void {
  const bad =
    files.length === 0 ||
    files.length > AI_IMPORT_MAX_IMAGES ||
    files.some(
      (f) =>
        f.size > AI_IMPORT_MAX_IMAGE_BYTES ||
        !(AI_IMPORT_ACCEPTED_TYPES as readonly string[]).includes(f.mimetype),
    );
  if (bad) {
    throw new AppError(400, AI_IMPORT_ERRORS.invalidUpload, "Upload 1–10 images up to 10 MB each");
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
