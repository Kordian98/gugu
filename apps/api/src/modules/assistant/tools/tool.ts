import type Anthropic from "@anthropic-ai/sdk";
import type { SalonPermission } from "@gugu/domain";
import type { z } from "zod";
import type { TokenVault } from "../firewall/token-vault";

/** Server-side context of a tool call: tenant and actor come from the session, never the model. */
export interface ToolContext {
  salonId: string;
  timeZone: string;
  permissions: ReadonlySet<SalonPermission>;
  vault: TokenVault;
  now: () => number;
}

/**
 * One product-agent tool (spec 08 §4.4). Inputs carry no tenant ids; entity arguments and results
 * are tokens; `output` is built only from PII-free field types (contracts `assistant/pii-free`).
 */
export interface AssistantTool<I = unknown, O = unknown> {
  name: string;
  description: string;
  /** Strict JSON schema sent to the model (all properties required, no extra keys). */
  inputSchema: Anthropic.Beta.Messages.BetaTool["input_schema"];
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  permission: SalonPermission;
  /** For the UI source chips: the period a result covers. */
  period?: (input: I) => { from: string; to: string };
  handler: (ctx: ToolContext, input: I) => Promise<O>;
}

export function toModelTool(tool: AssistantTool): Anthropic.Beta.Messages.BetaTool {
  return {
    name: tool.name,
    description: tool.description,
    strict: true,
    input_schema: tool.inputSchema,
  };
}
