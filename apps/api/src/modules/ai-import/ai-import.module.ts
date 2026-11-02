import Anthropic from "@anthropic-ai/sdk";
import { Module } from "@nestjs/common";
import { AppConfig } from "../../infrastructure/config/app-config";
import { CatalogModule } from "../catalog/catalog.facade";
import { AiCostMeter, RedisAiCostMeter } from "./application/ai-cost-meter";
import { AiImportService } from "./application/ai-import.service";
import { AiImportController } from "./http/ai-import.controller";
import { ANTHROPIC_CLIENT, PriceListExtractor } from "./llm/price-list-extractor";
import { FaceDetector, UltraFaceDetector } from "./pii/face-detector";
import { ImageGate } from "./pii/image-gate";
import { OcrEngine, TesseractOcrEngine } from "./pii/ocr-engine";

/**
 * AI onboarding import (topic 08 milestone IMP). Owns the no-PII image gate, the Claude extractor
 * and the interim AI cost meter; writes services only through the catalogue facade.
 */
@Module({
  imports: [CatalogModule],
  controllers: [AiImportController],
  providers: [
    AiImportService,
    ImageGate,
    PriceListExtractor,
    { provide: OcrEngine, useClass: TesseractOcrEngine },
    { provide: FaceDetector, useClass: UltraFaceDetector },
    { provide: AiCostMeter, useClass: RedisAiCostMeter },
    {
      provide: ANTHROPIC_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        config.env.ANTHROPIC_API_KEY
          ? // Retries are done by AiImportService so every attempt is metered against the cap.
            new Anthropic({ apiKey: config.env.ANTHROPIC_API_KEY, maxRetries: 0 })
          : null,
    },
  ],
})
export class AiImportModule {}
