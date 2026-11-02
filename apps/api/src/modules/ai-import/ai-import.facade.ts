// Public surface of the AI import module (boundary rule api-modules-use-facades). The LLM client,
// cost meter, model prices and provider-error classification are shared with the assistant module.
export { AiImportModule } from "./ai-import.module";
export { AiCostMeter, type CostReservation } from "./application/ai-cost-meter";
export { ANTHROPIC_CLIENT } from "./llm/price-list-extractor";
export {
  AI_ROUTES,
  type AiModel,
  costVnd,
  MODEL_PRICES_USD_PER_MTOK,
  type TokenUsage,
} from "./llm/models";
export { classifyProviderError, type ProviderFailure } from "./llm/provider-errors";
export { findContactDetails, type PiiMatch } from "./pii/pii-patterns";
