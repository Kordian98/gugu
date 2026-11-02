import { Module } from "@nestjs/common";
import { AiImportModule } from "../ai-import/ai-import.facade";
import { AssistantClock } from "./application/clock";
import { AssistantDirectory } from "./application/directory";
import { AssistantService } from "./application/assistant.service";
import { AssistantController } from "./http/assistant.controller";
import { AnthropicAssistantLlm, AssistantLlm } from "./llm/assistant-llm";
import { AssistantReadQueries } from "./tools/read-queries";
import { ReadTools } from "./tools/read-tools";

/**
 * AI business assistant (topic 08 A1/A2): runtime, PII firewall and the first read tools. Shares
 * the Anthropic client and the hard monthly AI cost cap with the AI import module.
 */
@Module({
  imports: [AiImportModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantClock,
    AssistantDirectory,
    AssistantReadQueries,
    ReadTools,
    { provide: AssistantLlm, useClass: AnthropicAssistantLlm },
  ],
})
export class AssistantModule {}
