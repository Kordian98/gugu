// PII suite for AI import (topic 08 §4.12, must stay at 100%): real OCR + face detector, a
// recording LLM client. Canary contact details and names rendered into price lists must never
// appear in what is sent to the LLM gateway; photos of people must be rejected before any call.
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_IMPORT_ERRORS, SUBSCRIPTION_ERRORS } from "@gugu/contracts";
import { fakeAnthropic, MemoryCostMeter, toolReply } from "../../../test/fixtures/ai-import/fakes";
import { CANARIES, PEOPLE_PHOTO, renderPriceList } from "../../../test/fixtures/ai-import/render";
import type { SalonContext } from "../../common/guards/principal";
import { AppError } from "../../common/problem/app-error";
import type { AppConfig } from "../../infrastructure/config/app-config";
import type { RateLimitService } from "../../infrastructure/rate-limit/rate-limit.service";
import type { AuditEntry, AuditService } from "../audit/audit.facade";
import type { CatalogService } from "../catalog/catalog.facade";
import type { EntitlementService } from "../subscriptions/subscriptions.facade";
import { AiImportService, type UploadedImage } from "./application/ai-import.service";
import { PriceListExtractor } from "./llm/price-list-extractor";
import { UltraFaceDetector } from "./pii/face-detector";
import { ImageGate } from "./pii/image-gate";
import { OcrEngine, TesseractOcrEngine } from "./pii/ocr-engine";
import { containsContactDetails } from "./pii/pii-patterns";

const ctx: SalonContext = {
  salonId: "0196f000-0000-7000-8000-000000000001",
  organizationId: "0196f000-0000-7000-8000-000000000002",
  role: "owner",
  permissions: new Set(),
};

const png = (buffer: Buffer): UploadedImage => ({
  buffer,
  mimetype: "image/png",
  size: buffer.length,
});

const gelRow = {
  name: { vi: "Sơn gel tay", en: "Gel polish" },
  category: "nails",
  price: 150000,
  priceMax: null,
  durationMinutes: null,
  variants: [],
  addOns: [],
  sourceImage: 1,
  confidence: "high",
};

describe("AI import PII gate (real OCR + face detection)", () => {
  const ocr = new TesseractOcrEngine();
  const gate = new ImageGate(new UltraFaceDetector(), ocr);
  const audits: AuditEntry[] = [];

  function setup(cap = 20_000, entitled = true) {
    const client = fakeAnthropic(() => toolReply([gelRow]));
    const meter = new MemoryCostMeter(cap);
    const service = new AiImportService(
      gate,
      new PriceListExtractor(client),
      meter,
      {
        isEnabled: () => Promise.resolve(entitled),
        assert: () =>
          entitled
            ? Promise.resolve()
            : Promise.reject(new AppError(403, SUBSCRIPTION_ERRORS.entitlementRequired, "no")),
      } as unknown as EntitlementService,
      {} as CatalogService,
      {
        record: (e: AuditEntry) => {
          audits.push(e);
          return Promise.resolve();
        },
      } as unknown as AuditService,
      { env: { AI_USD_TO_VND: 26_000 } } as AppConfig,
      { consume: () => Promise.resolve() } as unknown as RateLimitService,
    );
    return { client, meter, service };
  }

  /** Everything the gateway received, as text: JSON without image bytes + OCR of every image. */
  async function sentText(client: ReturnType<typeof setup>["client"]): Promise<string> {
    const parts: string[] = [];
    for (const body of client.requests) {
      parts.push(
        JSON.stringify(body, (key, value: unknown) => (key === "data" ? "[image]" : value)),
      );
      for (const m of body.messages) {
        for (const block of m.content as { type: string; source?: { data: string } }[]) {
          if (block.type === "image" && block.source) {
            const lines = await ocr.recognize(Buffer.from(block.source.data, "base64"));
            parts.push(lines.map((l) => l.map((w) => w.text).join(" ")).join("\n"));
          }
        }
      }
    }
    return parts.join("\n");
  }

  beforeAll(async () => {
    // Warm the OCR worker and the ONNX session once.
    await gate.process(await renderPriceList(), 1);
  }, 60_000);
  afterAll(async () => {
    await ocr.onModuleDestroy();
  });

  it("never sends canary phone numbers, emails, links, handles or names to the LLM", async () => {
    const { client, meter, service } = setup();
    const result = await service.extract(ctx, [
      png(await renderPriceList({ withPii: true })),
      png(await renderPriceList()),
    ]);

    expect(client.requests).toHaveLength(1);
    expect(result.items).toHaveLength(1);
    expect(result.images[0]?.redactedRegions).toBeGreaterThanOrEqual(8);
    expect(result.images[1]?.redactedRegions).toBe(0);

    const text = await sentText(client);
    for (const canary of Object.values(CANARIES)) expect(text).not.toContain(canary);
    expect(containsContactDetails(text)).toBe(false);
    // The price list itself still reaches the model.
    expect(text).toMatch(/gel/i);
    expect(text).toMatch(/150/);

    expect(meter.log[0]).toMatch(/^reserve:/);
    expect(meter.log[1]).toMatch(/^commit:/);
  }, 60_000);

  it("rejects a photo of people before any LLM call or cost reservation", async () => {
    const { client, meter, service } = setup();
    const people = await readFile(PEOPLE_PHOTO);
    const err = await service
      .extract(ctx, [
        png(await renderPriceList()),
        { buffer: people, mimetype: "image/jpeg", size: people.length },
      ])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(AI_IMPORT_ERRORS.personDetected);
    expect((err as AppError).options.errors?.[0]?.path).toBe("images.2");
    expect(client.requests).toHaveLength(0);
    expect(meter.log).toEqual([]);
    expect(audits.at(-1)).toMatchObject({
      action: "ai_import.blocked",
      metadata: { reason: AI_IMPORT_ERRORS.personDetected, image: 2 },
    });
  }, 60_000);

  it("masks a small avatar in a screenshot instead of rejecting it", async () => {
    const detector = new UltraFaceDetector();
    const people = await readFile(PEOPLE_PHOTO);
    const meta = await sharp(people).metadata();
    const [face] = await detector.detect(people, meta.width, meta.height);
    if (!face) throw new Error("fixture has no face");
    const pad = 12;
    const avatar = await sharp(people)
      .extract({
        left: Math.max(0, Math.round(face.box.x0) - pad),
        top: Math.max(0, Math.round(face.box.y0) - pad),
        width: Math.round(face.box.x1 - face.box.x0) + 2 * pad,
        height: Math.round(face.box.y1 - face.box.y0) + 2 * pad,
      })
      .resize(64, 64)
      .png()
      .toBuffer();
    const screenshot = await sharp(await renderPriceList())
      .composite([{ input: avatar, top: 8, left: 1000 }])
      .png()
      .toBuffer();
    const gated = await gate.process(screenshot, 1);
    expect(gated.maskedFaces).toBe(1);
    const out = await sharp(gated.data).metadata();
    expect(await detector.detect(gated.data, out.width, out.height)).toEqual([]);
  }, 30_000);

  it("refuses to send when the redacted image still reads as a contact detail", async () => {
    class LeakyOcr extends OcrEngine {
      calls = 0;
      recognize() {
        this.calls++;
        // First pass finds nothing to redact; the verification pass reads a phone number.
        return Promise.resolve(
          this.calls === 1 ? [] : [[{ text: "0912345678", bbox: { x0: 0, y0: 0, x1: 9, y1: 9 } }]],
        );
      }
    }
    const leaky = new ImageGate(new UltraFaceDetector(), new LeakyOcr());
    await expect(leaky.process(await renderPriceList(), 1)).rejects.toMatchObject({
      code: AI_IMPORT_ERRORS.piiCheckFailed,
    });
  }, 30_000);

  it("rejects unreadable files and bad uploads", async () => {
    const { client, service } = setup();
    await expect(service.extract(ctx, [png(Buffer.from("not an image"))])).rejects.toMatchObject({
      code: AI_IMPORT_ERRORS.imageUnreadable,
    });
    await expect(service.extract(ctx, [])).rejects.toMatchObject({
      code: AI_IMPORT_ERRORS.invalidUpload,
    });
    const gif = { buffer: Buffer.from("GIF89a"), mimetype: "image/gif", size: 6 };
    await expect(service.extract(ctx, [gif])).rejects.toMatchObject({
      code: AI_IMPORT_ERRORS.invalidUpload,
    });
    expect(client.requests).toHaveLength(0);
  });

  it("stops at the hard monthly cap without calling the model", async () => {
    const { client, service } = setup(1_000);
    await expect(service.extract(ctx, [png(await renderPriceList())])).rejects.toMatchObject({
      status: 429,
      code: SUBSCRIPTION_ERRORS.quotaExceeded,
    });
    expect(client.requests).toHaveLength(0);
  }, 30_000);

  it("requires the entitlement", async () => {
    const { client, service } = setup(20_000, false);
    await expect(service.extract(ctx, [png(await renderPriceList())])).rejects.toMatchObject({
      code: SUBSCRIPTION_ERRORS.entitlementRequired,
    });
    expect(client.requests).toHaveLength(0);
  });
});
