// Cost metering of provider attempts (security review of 08-IMP): every attempt is reserved and
// settled on its own; a reservation is released only when the request provably was not billed.
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AI_IMPORT_ERRORS, SUBSCRIPTION_ERRORS } from "@gugu/contracts";
import {
  fakeAnthropic,
  MemoryCostMeter,
  toolReply,
} from "../../../../test/fixtures/ai-import/fakes";
import type { SalonContext } from "../../../common/guards/principal";
import type { AppConfig } from "../../../infrastructure/config/app-config";
import type { RateLimitService } from "../../../infrastructure/rate-limit/rate-limit.service";
import type { AuditEntry, AuditService } from "../../audit/audit.facade";
import type { CatalogService } from "../../catalog/catalog.facade";
import type { EntitlementService } from "../../subscriptions/subscriptions.facade";
import { costVnd } from "../llm/models";
import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  estimateInputTokens,
  PriceListExtractor,
} from "../llm/price-list-extractor";
import type { ImageGate } from "../pii/image-gate";
import { AiImportService } from "./ai-import.service";

const ctx: SalonContext = {
  salonId: "0196f000-0000-7000-8000-000000000001",
  organizationId: "0196f000-0000-7000-8000-000000000002",
  role: "owner",
  permissions: new Set(),
};
const FX = 26_000;
const WORST = costVnd(
  EXTRACTION_MODEL,
  {
    inputTokens: estimateInputTokens(1),
    outputTokens: EXTRACTION_MAX_TOKENS,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  FX,
);
// fakeAnthropic replies with 4,200 input / 900 output tokens.
const ACTUAL = costVnd(
  EXTRACTION_MODEL,
  { inputTokens: 4200, outputTokens: 900, cacheReadTokens: 0, cacheWriteTokens: 0 },
  FX,
);
const row = {
  name: { vi: "Sơn gel", en: "Gel polish" },
  category: "nails",
  price: 150000,
  priceMax: null,
  durationMinutes: 45,
  variants: [],
  addOns: [],
  sourceImage: 1,
  confidence: "high",
};

const status = (code: number) =>
  Anthropic.APIError.generate(code, { error: { type: "x" } }, "failed", new Headers());
const refused = () =>
  new Anthropic.APIConnectionError({
    cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }),
  });

class TestService extends AiImportService {
  protected override pause(): Promise<void> {
    return Promise.resolve();
  }
}

/** `script[i]` is the error thrown on attempt i+1; attempts past the script succeed. */
function setup(script: Error[], cap = 1_000_000) {
  const calls = { n: 0 };
  const ok = fakeAnthropic(() => toolReply([row]));
  const client = {
    beta: {
      messages: {
        create: (...args: Parameters<typeof ok.beta.messages.create>) => {
          const err = script[calls.n++];
          return err ? Promise.reject(err) : ok.beta.messages.create(...args);
        },
      },
    },
  };
  const meter = new MemoryCostMeter(cap);
  const audits: AuditEntry[] = [];
  const gate = {
    process: () =>
      Promise.resolve({
        data: Buffer.from("jpeg"),
        mediaType: "image/jpeg" as const,
        redactedRegions: 0,
        maskedFaces: 0,
      }),
  } as unknown as ImageGate;
  const service = new TestService(
    gate,
    new PriceListExtractor(client),
    meter,
    {
      isEnabled: () => Promise.resolve(true),
      assert: () => Promise.resolve(),
    } as unknown as EntitlementService,
    {} as CatalogService,
    {
      record: (e: AuditEntry) => {
        audits.push(e);
        return Promise.resolve();
      },
    } as unknown as AuditService,
    { env: { AI_USD_TO_VND: FX } } as AppConfig,
    { consume: () => Promise.resolve() } as unknown as RateLimitService,
  );
  const upload = [{ buffer: Buffer.from("png"), mimetype: "image/png", size: 3 }];
  return { service, meter, calls, audits, run: () => service.extract(ctx, upload) };
}

describe("AI import provider attempts and the cost cap", () => {
  it("meters a successful single attempt at the actual cost", async () => {
    const t = setup([]);
    await t.run();
    expect(t.meter.log).toEqual([`reserve:${String(WORST)}`, `commit:${String(ACTUAL)}`]);
    expect(t.meter.used).toBe(ACTUAL);
  });

  it("charges the worst case for a 5xx, then retries once with a new reservation", async () => {
    const t = setup([status(529)]);
    await t.run();
    expect(t.calls.n).toBe(2);
    expect(t.meter.log).toEqual([
      `reserve:${String(WORST)}`,
      `commit:${String(WORST)}`,
      `reserve:${String(WORST)}`,
      `commit:${String(ACTUAL)}`,
    ]);
    expect(t.meter.used).toBe(WORST + ACTUAL);
  });

  it("charges the worst case for timeouts and gives up after two attempts", async () => {
    const t = setup([
      new Anthropic.APIConnectionTimeoutError(),
      new Anthropic.APIConnectionTimeoutError(),
    ]);
    await expect(t.run()).rejects.toMatchObject({ code: AI_IMPORT_ERRORS.extractionFailed });
    expect(t.calls.n).toBe(2);
    expect(t.meter.used).toBe(2 * WORST);
    expect(t.meter.reservations.size).toBe(0);
    expect(t.audits.at(-1)).toMatchObject({
      action: "ai_import.blocked",
      metadata: { reason: "ai_import.extraction_failed:provider_maybe_billed", costVnd: WORST },
    });
  });

  it("charges the worst case for an abort and does not retry", async () => {
    const t = setup([new Anthropic.APIUserAbortError()]);
    await expect(t.run()).rejects.toMatchObject({ code: AI_IMPORT_ERRORS.extractionFailed });
    expect(t.calls.n).toBe(1);
    expect(t.meter.used).toBe(WORST);
  });

  it("releases when the connection was refused before sending, then retries", async () => {
    const t = setup([refused()]);
    await t.run();
    expect(t.meter.log).toEqual([
      `reserve:${String(WORST)}`,
      "release",
      `reserve:${String(WORST)}`,
      `commit:${String(ACTUAL)}`,
    ]);
    expect(t.meter.used).toBe(ACTUAL);
  });

  it("releases on a 4xx rejection and does not retry it", async () => {
    const t = setup([status(400)]);
    await expect(t.run()).rejects.toMatchObject({ code: AI_IMPORT_ERRORS.extractionFailed });
    expect(t.calls.n).toBe(1);
    expect(t.meter.log).toEqual([`reserve:${String(WORST)}`, "release"]);
    expect(t.meter.used).toBe(0);
  });

  it("stops retrying when the cap cannot cover another attempt", async () => {
    const t = setup([status(500)], WORST + WORST - 1);
    await expect(t.run()).rejects.toMatchObject({
      status: 429,
      code: SUBSCRIPTION_ERRORS.quotaExceeded,
    });
    expect(t.calls.n).toBe(1);
    expect(t.meter.used).toBe(WORST);
  });
});
