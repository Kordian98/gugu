/**
 * Model routing and list prices for GuGu AI features (topic 08 §4.1). Prices are Anthropic
 * first-party list prices in USD per million tokens; verify when changing models.
 */
export const AI_ROUTES = {
  /** Default chat route (assistant, later). */
  fast: "claude-haiku-5-5",
  /** Escalation route; also price-list photo structuring (vision + strict tool). */
  standard: "claude-sonnet-5-5",
  /** Pro monthly business review only. */
  deep: "claude-opus-5-5",
} as const;

export type AiModel = (typeof AI_ROUTES)[keyof typeof AI_ROUTES];

export const MODEL_PRICES_USD_PER_MTOK: Record<
  AiModel,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Cost in VND, rounded up to the next đồng. */
export function costVnd(model: AiModel, usage: TokenUsage, usdToVnd: number): number {
  const p = MODEL_PRICES_USD_PER_MTOK[model];
  const usd =
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite) /
    1_000_000;
  return Math.ceil(usd * usdToVnd);
}

/** Image tokens ≈ width × height / 750 (Anthropic vision docs); our images are ≤ 1568 px. */
export const MAX_TOKENS_PER_IMAGE = 1_600;
