import type Anthropic from "@anthropic-ai/sdk";
import { SUBSCRIPTION_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../src/common/problem/app-error";
import {
  AiCostMeter,
  type CostReservation,
} from "../../../src/modules/ai-import/application/ai-cost-meter";
import {
  type AnthropicMessagesClient,
  PRICE_LIST_TOOL,
} from "../../../src/modules/ai-import/llm/price-list-extractor";

type Body = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** Records every request body; replies with `reply(body)` merged over a tool_use stop. */
export function fakeAnthropic(
  reply: (body: Body) => Partial<Anthropic.Beta.Messages.BetaMessage>,
): AnthropicMessagesClient & { requests: Body[] } {
  const requests: Body[] = [];
  return {
    requests,
    beta: {
      messages: {
        create: (body: Body) => {
          requests.push(body);
          return Promise.resolve({
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: body.model,
            stop_reason: "tool_use",
            usage: { input_tokens: 4200, output_tokens: 900 },
            content: [],
            ...reply(body),
          } as unknown as Anthropic.Beta.Messages.BetaMessage);
        },
      },
    },
  };
}

/** A reply that calls the price-list tool with `services`. */
export const toolReply = (services: unknown[]) => ({
  content: [
    { type: "tool_use", id: "tu_1", name: PRICE_LIST_TOOL.name, input: { services } },
  ] as unknown as Anthropic.Beta.Messages.BetaContentBlock[],
});

/** In-memory cap with the same semantics as the Redis meter. */
export class MemoryCostMeter extends AiCostMeter {
  used = 0;
  readonly reservations = new Map<string, number>();
  readonly log: string[] = [];
  private seq = 0;
  constructor(private readonly cap: number) {
    super();
  }
  usage() {
    return Promise.resolve({ usedVnd: this.used, capVnd: this.cap });
  }
  reserve(salonId: string, amountVnd: number): Promise<CostReservation> {
    if (this.used + amountVnd > this.cap) {
      return Promise.reject(new AppError(429, SUBSCRIPTION_ERRORS.quotaExceeded, "cap"));
    }
    const id = String(++this.seq);
    this.used += amountVnd;
    this.reservations.set(id, amountVnd);
    this.log.push(`reserve:${String(amountVnd)}`);
    return Promise.resolve({ id, salonId, amountVnd, monthKey: "test" });
  }
  commit(r: CostReservation, actualVnd: number): Promise<void> {
    this.used += actualVnd - (this.reservations.get(r.id) ?? 0);
    this.reservations.delete(r.id);
    this.log.push(`commit:${String(actualVnd)}`);
    return Promise.resolve();
  }
  release(r: CostReservation): Promise<void> {
    this.used -= this.reservations.get(r.id) ?? 0;
    this.reservations.delete(r.id);
    this.log.push("release");
    return Promise.resolve();
  }
  monthlyUsage(salonIds: readonly string[]): Promise<Map<string, number>> {
    return Promise.resolve(new Map(salonIds.map((id) => [id, this.used])));
  }
}
