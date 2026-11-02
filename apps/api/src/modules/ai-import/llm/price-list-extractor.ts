import type Anthropic from "@anthropic-ai/sdk";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AI_IMPORT_CATEGORY_SLUGS,
  AI_IMPORT_ERRORS,
  type AiImportDraftService,
  aiImportDraftServiceSchema,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { AI_ROUTES, type AiModel, MAX_TOKENS_PER_IMAGE, type TokenUsage } from "./models";
import { classifyProviderError, type ProviderFailure } from "./provider-errors";

/** The subset of the Anthropic client we call (tests inject a recording fake). */
export interface AnthropicMessagesClient {
  beta: {
    messages: {
      create(
        body: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        options?: { signal?: AbortSignal; timeout?: number },
      ): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
}

/** `null` when ANTHROPIC_API_KEY is not set: the feature reports "not configured". */
export const ANTHROPIC_CLIENT = Symbol("ANTHROPIC_CLIENT");

export interface ExtractionImage {
  data: Buffer;
  mediaType: "image/jpeg";
}

export interface ExtractionResult {
  items: AiImportDraftService[];
  model: AiModel;
  usage: TokenUsage;
}

export const EXTRACTION_MODEL: AiModel = AI_ROUTES.standard;
export const EXTRACTION_MAX_TOKENS = 16_000;
const FIXED_PROMPT_TOKENS = 2_000;

/** Worst-case input tokens for a request with `images` images (for the cost reservation). */
export function estimateInputTokens(images: number): number {
  return FIXED_PROMPT_TOKENS + images * MAX_TOKENS_PER_IMAGE;
}

const TOOL_NAME = "record_price_list";

/** Frozen system prompt (no per-request data, so it caches). */
export const SYSTEM_PROMPT = `You turn photos and screenshots of a Vietnamese beauty or wellness salon's price list into a structured service menu.

Rules:
- Record every service you can read, in the order it appears. Call the ${TOOL_NAME} tool exactly once with all of them. Do not answer in text.
- name.vi: the service name as written (fix obvious OCR-style typos, keep Vietnamese diacritics). name.en: a short natural English translation.
- Prices are integer VND. "150k" = 150000, "1tr2" = 1200000, "150.000đ" = 150000. A range "350-450k" gives price 350000 and priceMax 450000. "từ 200k" gives price 200000 and priceMax null.
- durationMinutes only when the list states it ("60 phút", "45p", "1h30" = 90); otherwise null. Never guess a duration.
- When one service has sizes or options with their own prices (e.g. short/medium/long hair, hands/feet), make them variants of one service instead of separate services. The service price is then the lowest variant price.
- Extras that are added to a service (e.g. "phá gel +30k", "đính đá +10k/móng") are addOns of the service they belong to; extraPrice is the surcharge.
- category: the closest of ${AI_IMPORT_CATEGORY_SLUGS.join(", ")}; null if none fits.
- confidence: "low" when text is blurry, partly hidden or the price is ambiguous; otherwise "high".
- sourceImage: the 1-based number of the image the service is on.
- Black boxes are redactions of private details. Ignore them, and never write names of people, phone numbers, addresses or links in any field.
- If the images contain no price list, call the tool with an empty services array.`;

const nameSchema = {
  type: "object",
  properties: { vi: { type: "string" }, en: { type: "string" } },
  required: ["vi", "en"],
  additionalProperties: false,
} as const;
const nullableInt = { type: ["integer", "null"] } as const;

/** Strict tool schema (all fields required, nullable where optional). Validated again with Zod. */
export const PRICE_LIST_TOOL = {
  name: TOOL_NAME,
  description:
    "Record the salon services read from the price-list images. Call exactly once with every service.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      services: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: nameSchema,
            category: { type: ["string", "null"], enum: [...AI_IMPORT_CATEGORY_SLUGS, null] },
            price: nullableInt,
            priceMax: nullableInt,
            durationMinutes: nullableInt,
            variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: nameSchema,
                  price: nullableInt,
                  priceMax: nullableInt,
                  durationMinutes: nullableInt,
                },
                required: ["name", "price", "priceMax", "durationMinutes"],
                additionalProperties: false,
              },
            },
            addOns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: nameSchema,
                  extraPrice: { type: "integer" },
                  extraPriceMax: nullableInt,
                  extraDurationMinutes: nullableInt,
                },
                required: ["name", "extraPrice", "extraPriceMax", "extraDurationMinutes"],
                additionalProperties: false,
              },
            },
            sourceImage: { type: "integer" },
            confidence: { type: "string", enum: ["high", "low"] },
          },
          required: [
            "name",
            "category",
            "price",
            "priceMax",
            "durationMinutes",
            "variants",
            "addOns",
            "sourceImage",
            "confidence",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["services"],
    additionalProperties: false,
  },
} satisfies Anthropic.Beta.Messages.BetaTool;

/**
 * One structured Claude call over the redacted images (topic 08 §4.5): Sonnet route, adaptive
 * thinking at medium effort, strict tool, server-side refusal fallback. The request contains only
 * the frozen prompt, image labels and the gated images — no salon data, no user text.
 */
@Injectable()
export class PriceListExtractor {
  private readonly logger = new Logger(PriceListExtractor.name);

  constructor(@Inject(ANTHROPIC_CLIENT) private readonly client: AnthropicMessagesClient | null) {}

  get configured(): boolean {
    return this.client !== null;
  }

  async extract(images: ExtractionImage[], signal?: AbortSignal): Promise<ExtractionResult> {
    if (!this.client) {
      throw new AppError(503, AI_IMPORT_ERRORS.notConfigured, "AI import is not configured");
    }
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    images.forEach((img, i) => {
      content.push({ type: "text", text: `Image ${String(i + 1)} of ${String(images.length)}:` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data.toString("base64") },
      });
    });
    content.push({ type: "text", text: `Record the price list with the ${TOOL_NAME} tool.` });

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await this.client.beta.messages.create(
        {
          model: EXTRACTION_MODEL,
          max_tokens: EXTRACTION_MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: [PRICE_LIST_TOOL],
          tool_choice: { type: "auto" },
          messages: [{ role: "user", content }],
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { timeout: 120_000, ...(signal ? { signal } : {}) },
      );
    } catch (error) {
      const failure = classifyProviderError(error);
      this.logger.warn(
        { err: describe(error), ...failure },
        "price-list extraction request failed",
      );
      throw new ProviderCallFailed(failure, error);
    }

    const usage: TokenUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
      throw new ExtractionFailed(message.stop_reason, usage);
    }
    const call = message.content.find(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock =>
        b.type === "tool_use" && b.name === TOOL_NAME,
    );
    if (!call) throw new ExtractionFailed("no_tool_call", usage);
    return { items: parseServices(call.input, images.length), model: EXTRACTION_MODEL, usage };
  }
}

/**
 * The request failed at the provider or on the way there. `failure.billing` tells the cost meter
 * whether the reservation may be released (`not_sent`, `rejected`) or must be committed.
 */
export class ProviderCallFailed extends AppError {
  constructor(
    readonly failure: ProviderFailure,
    cause: unknown,
  ) {
    super(502, AI_IMPORT_ERRORS.extractionFailed, "Extraction request failed", { cause });
  }
}

/** The call was billed but produced nothing usable; carries usage so the cost is still committed. */
export class ExtractionFailed extends AppError {
  constructor(
    readonly reason: string,
    readonly usage: TokenUsage,
  ) {
    super(502, AI_IMPORT_ERRORS.extractionFailed, `Extraction failed: ${reason}`);
  }
}

/** Keeps rows that pass the contract; repairs what can be repaired, drops the rest. */
export function parseServices(input: unknown, imageCount: number): AiImportDraftService[] {
  const services = (input as { services?: unknown } | null)?.services;
  if (!Array.isArray(services)) return [];
  const out: AiImportDraftService[] = [];
  for (const raw of services.slice(0, 200)) {
    const row = raw as Record<string, unknown>;
    const candidate = {
      ...row,
      sourceImage: Math.min(Math.max(Number(row["sourceImage"]) || 1, 1), imageCount),
      durationMinutes: validMinutes(row["durationMinutes"]),
      variants: Array.isArray(row["variants"])
        ? (row["variants"] as Record<string, unknown>[]).slice(0, 20).map((v) => ({
            ...v,
            durationMinutes: validMinutes(v["durationMinutes"]),
          }))
        : [],
      addOns: Array.isArray(row["addOns"]) ? (row["addOns"] as unknown[]).slice(0, 20) : [],
    };
    const parsed = aiImportDraftServiceSchema.safeParse(candidate);
    if (parsed.success && parsed.data.name.vi.trim() !== "") out.push(parsed.data);
  }
  return out;
}

const validMinutes = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 5 && v <= 1440 ? v : null;

function describe(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    return `${String(error.status)} ${error instanceof Error ? error.name : ""}`;
  }
  return error instanceof Error ? error.name : "unknown";
}
