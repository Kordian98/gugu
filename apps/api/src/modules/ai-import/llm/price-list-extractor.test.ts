import { describe, expect, it } from "vitest";
import { AI_IMPORT_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { fakeAnthropic, toolReply } from "../../../../test/fixtures/ai-import/fakes";
import { costVnd } from "./models";
import {
  type AnthropicMessagesClient,
  EXTRACTION_MODEL,
  ExtractionFailed,
  parseServices,
  PriceListExtractor,
} from "./price-list-extractor";

const gel = {
  name: { vi: "Sơn gel tay", en: "Gel polish (hands)" },
  category: "nails",
  price: 150000,
  priceMax: null,
  durationMinutes: null,
  variants: [],
  addOns: [
    {
      name: { vi: "Phá gel", en: "Gel removal" },
      extraPrice: 30000,
      extraPriceMax: null,
      extraDurationMinutes: 15,
    },
  ],
  sourceImage: 1,
  confidence: "high",
};
const image = { data: Buffer.from("jpeg"), mediaType: "image/jpeg" as const };

describe("PriceListExtractor", () => {
  it("is not configured without a client", async () => {
    const x = new PriceListExtractor(null);
    expect(x.configured).toBe(false);
    await expect(x.extract([image])).rejects.toMatchObject({
      status: 503,
      code: AI_IMPORT_ERRORS.notConfigured,
    });
  });

  it("sends one Sonnet request with a strict tool, no forced tool choice and a refusal fallback", async () => {
    const client = fakeAnthropic(() => toolReply([gel]));
    const result = await new PriceListExtractor(client).extract([image, image]);
    expect(result.items).toHaveLength(1);
    expect(result.model).toBe("claude-sonnet-5-5");
    const body = client.requests[0];
    expect(client.requests).toHaveLength(1);
    expect(body?.model).toBe(EXTRACTION_MODEL);
    expect(body?.tools?.[0]).toMatchObject({ name: "record_price_list", strict: true });
    expect(body?.tool_choice).toEqual({ type: "auto" });
    expect(body?.thinking).toEqual({ type: "adaptive" });
    expect(body?.output_config).toEqual({ effort: "medium" });
    expect(body?.fallbacks).toBe("default");
    expect(body?.betas).toContain("server-side-fallback-2026-07-01");
    expect(body).not.toHaveProperty("temperature");
    const blocks = body?.messages[0]?.content as { type: string }[];
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(2);
  });

  it("fails with usage on refusal or a missing tool call", async () => {
    const refused = fakeAnthropic(() => ({ stop_reason: "refusal", content: [] }));
    const err = await new PriceListExtractor(refused).extract([image]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionFailed);
    expect((err as ExtractionFailed).usage.inputTokens).toBe(4200);

    const silent = fakeAnthropic(() => ({ stop_reason: "end_turn", content: [] }));
    await expect(new PriceListExtractor(silent).extract([image])).rejects.toBeInstanceOf(
      ExtractionFailed,
    );
  });

  it("maps provider errors to extraction_failed", async () => {
    const broken: AnthropicMessagesClient = {
      beta: { messages: { create: () => Promise.reject(new Error("boom")) } },
    };
    const err = await new PriceListExtractor(broken).extract([image]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(AI_IMPORT_ERRORS.extractionFailed);
  });
});

describe("parseServices", () => {
  it("keeps valid rows, repairs bad durations and image indexes, drops invalid rows", () => {
    const rows = parseServices(
      {
        services: [
          gel,
          { ...gel, durationMinutes: 2, sourceImage: 9 },
          { ...gel, name: { vi: "", en: "" } },
          { ...gel, price: -5 },
          { ...gel, category: "tattoo" },
          "nonsense",
        ],
      },
      2,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ durationMinutes: null, sourceImage: 2 });
  });

  it("returns nothing for malformed input", () => {
    expect(parseServices(null, 1)).toEqual([]);
    expect(parseServices({ services: "x" }, 1)).toEqual([]);
  });
});

describe("costVnd", () => {
  it("prices Sonnet tokens in VND", () => {
    // 10k in × $2/M + 2k out × $10/M = $0.04 → 1,040 VND at 26,000.
    expect(
      costVnd(
        "claude-sonnet-5-5",
        { inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
        26_000,
      ),
    ).toBe(1040);
  });
});
