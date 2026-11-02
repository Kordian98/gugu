import { AI_ROUTES, type AiModel } from "../../ai-import/ai-import.facade";

/**
 * Model routing (spec 08 §4.1, owner q32): Haiku answers most turns; Sonnet takes comparisons,
 * multi-part questions and escalations; Opus is never used in chat.
 */
export type RouteName = "fast" | "standard";

export interface Route {
  name: RouteName;
  model: AiModel;
  effort: "low" | "medium";
  maxTokens: number;
  /** Server-side refusal fallback (not available for Haiku 5.5: we re-run on Sonnet instead). */
  serverFallback: boolean;
}

export const ROUTES: Record<RouteName, Route> = {
  fast: {
    name: "fast",
    model: AI_ROUTES.fast,
    effort: "low",
    maxTokens: 2_048,
    serverFallback: false,
  },
  standard: {
    name: "standard",
    model: AI_ROUTES.standard,
    effort: "medium",
    maxTokens: 4_096,
    serverFallback: true,
  },
};

const COMPARISON =
  /\b(so sánh|so với|compare|comparison|versus|vs\.?|trend|xu hướng|tăng|giảm|growth|why|tại sao|vì sao|phân tích|analy[sz]e)\b/iu;

/** Rule-based pre-router: long or comparative questions start on Sonnet. */
export function pickRoute(text: string): RouteName {
  if (text.length > 280) return "standard";
  return COMPARISON.test(text) ? "standard" : "fast";
}

/** Max model calls per turn (tool round-trips + one escalation). */
export const MAX_CALLS_PER_TURN = 6;
