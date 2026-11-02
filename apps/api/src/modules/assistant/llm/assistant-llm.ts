import type Anthropic from "@anthropic-ai/sdk";
import { Inject, Injectable } from "@nestjs/common";
import { ANTHROPIC_CLIENT } from "../../ai-import/ai-import.facade";

export type TurnBody = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type TurnMessage = Anthropic.Beta.Messages.BetaMessage;

/**
 * One streamed model call (spec 08 §4.1). The Anthropic adapter is the only implementation; tests
 * inject a recording fake. `onText` receives raw (tokenized) text deltas.
 */
export abstract class AssistantLlm {
  abstract readonly configured: boolean;
  abstract turn(
    body: TurnBody,
    onText: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<TurnMessage>;
}

/** The streaming subset of the Anthropic client. */
interface StreamingClient {
  beta: {
    messages: {
      stream(
        body: TurnBody,
        options?: { signal?: AbortSignal; timeout?: number },
      ): {
        on(event: "text", listener: (delta: string) => void): unknown;
        finalMessage(): Promise<TurnMessage>;
      };
    };
  };
}

@Injectable()
export class AnthropicAssistantLlm extends AssistantLlm {
  constructor(@Inject(ANTHROPIC_CLIENT) private readonly client: StreamingClient | null) {
    super();
  }

  get configured(): boolean {
    return this.client !== null;
  }

  async turn(body: TurnBody, onText: (delta: string) => void, signal?: AbortSignal) {
    if (!this.client) throw new Error("assistant LLM not configured");
    const stream = this.client.beta.messages.stream(body, {
      timeout: 90_000,
      ...(signal ? { signal } : {}),
    });
    stream.on("text", onText);
    return stream.finalMessage();
  }
}
