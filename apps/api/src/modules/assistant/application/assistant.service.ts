import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger } from "@nestjs/common";
import {
  ASSISTANT_ERRORS,
  type AssistantEvent,
  type AssistantStatus,
  type AssistantTurnInputParsed,
} from "@gugu/contracts";
import { isoWeekday, toLocal } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import {
  AiCostMeter,
  classifyProviderError,
  type CostReservation,
  costVnd,
} from "../../ai-import/ai-import.facade";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";
import { checkToolResult } from "../firewall/allowlist";
import { StreamRehydrator } from "../firewall/rehydrate";
import { containsPersonalData, type Directory, scrubUserText } from "../firewall/scrubber";
import { TokenVault } from "../firewall/token-vault";
import { AssistantLlm, type TurnBody, type TurnMessage } from "../llm/assistant-llm";
import { ReadTools, ToolInputError } from "../tools/read-tools";
import { type AssistantTool, type ToolContext, toModelTool } from "../tools/tool";
import { AssistantDirectory } from "./directory";
import { contextLine, SYSTEM_PROMPT } from "./prompt";
import { MAX_CALLS_PER_TURN, pickRoute, type Route, ROUTES } from "./routing";

type Param = Anthropic.Beta.Messages.BetaMessageParam;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

const ESCALATE_TOOL = "request_deeper_analysis";
const ESCALATE: Anthropic.Beta.Messages.BetaTool = {
  name: ESCALATE_TOOL,
  description:
    "Hand this question to a more capable model. Use for comparisons between periods, several metrics at once, or when you are unsure. Takes no input.",
  strict: true,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
};

export type Emit = (event: AssistantEvent) => void;

/**
 * One assistant turn (spec 08 A1/A2): scrub the user text → model ⇄ tools loop behind the PII
 * firewall → stream the re-hydrated answer. Every model call is metered against the hard monthly
 * AI cap; every tool call is audited. Model-facing history is stored tokenized and append-only.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: AssistantLlm,
    private readonly meter: AiCostMeter,
    private readonly entitlements: EntitlementService,
    private readonly directory: AssistantDirectory,
    private readonly readTools: ReadTools,
    private readonly config: AppConfig,
  ) {}

  async status(ctx: SalonContext): Promise<AssistantStatus> {
    return {
      configured: this.llm.configured,
      entitled: await this.entitlements.isEnabled(ctx.salonId, "ai.agent.enabled"),
      permitted: ctx.permissions.has("assistant.use"),
    };
  }

  /** Checks that must pass before the HTTP response switches to a stream. */
  async preflight(ctx: SalonContext): Promise<void> {
    if (!this.llm.configured) {
      throw new AppError(503, ASSISTANT_ERRORS.notConfigured, "Assistant is not configured");
    }
    await this.entitlements.assert(ctx.salonId, "ai.agent.enabled");
  }

  async turn(
    ctx: SalonContext,
    userId: string,
    input: AssistantTurnInputParsed,
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    const conversation = await this.conversation(ctx, userId, input);
    emit({ type: "conversation", conversationId: conversation.id });

    const salon = await this.prisma.salon.findUniqueOrThrow({
      where: { id: ctx.salonId },
      select: { timezone: true },
    });
    const vault = await TokenVault.load(this.prisma, ctx.salonId, conversation.id);
    const directory = await this.directory.load(ctx.salonId);
    const scrubbed = await scrubUserText(input.text, directory, vault);
    await vault.flush();
    let names = await this.directory.displayNames(
      ctx.salonId,
      vault,
      ctx.permissions,
      input.locale,
    );
    // Mask preview: what the model receives, with recognised staff shown as "@Name" for the user.
    const preview = new Map([...names].map(([token, name]) => [token, `@${name}`]));
    emit({
      type: "masked",
      text: this.rehydrate(scrubbed.text, preview),
      changed: scrubbed.changed,
    });

    const today = toLocal(Date.now(), salon.timezone).date;
    const history = await this.history(conversation.id, ctx.salonId);
    const userMessage: Param = {
      role: "user",
      content: [
        { type: "text", text: contextLine(today, isoWeekday(today), input.locale) },
        { type: "text", text: scrubbed.text },
      ],
    };
    await this.persist(ctx.salonId, conversation.id, userMessage);
    const messages: Param[] = [...history, userMessage];

    const tools = this.readTools.all().filter((t) => ctx.permissions.has(t.permission));
    const toolCtx: ToolContext = {
      salonId: ctx.salonId,
      timeZone: salon.timezone,
      permissions: ctx.permissions,
      vault,
      now: () => Date.now(),
    };
    let route: Route = ROUTES[pickRoute(scrubbed.text)];

    for (let call = 1; call <= MAX_CALLS_PER_TURN; call++) {
      const rehydrator = new StreamRehydrator((t) => names.get(t));
      const message = await this.callModel(
        ctx,
        route,
        tools,
        messages,
        directory,
        (delta) => {
          const text = rehydrator.push(delta);
          if (text) emit({ type: "delta", text });
        },
        signal,
      );
      const tail = rehydrator.flush();
      if (tail) emit({ type: "delta", text: tail });

      if (message.stop_reason === "refusal") {
        if (route.name === "fast") {
          route = ROUTES.standard; // Haiku has no server-side fallback: re-run on Sonnet.
          continue;
        }
        throw new AppError(502, ASSISTANT_ERRORS.failed, "Assistant refused");
      }
      const assistantMessage: Param = { role: "assistant", content: message.content as Block[] };
      await this.persist(ctx.salonId, conversation.id, assistantMessage, message, route);
      messages.push(assistantMessage);

      const uses = message.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
      );
      if (message.stop_reason !== "tool_use" || uses.length === 0) break;

      const results: Block[] = [];
      for (const use of uses) {
        if (use.name === ESCALATE_TOOL) {
          route = ROUTES.standard;
          results.push({ type: "tool_result", tool_use_id: use.id, content: '{"ok":true}' });
          continue;
        }
        const tool = tools.find((t) => t.name === use.name);
        results.push(await this.runTool(ctx, conversation.id, toolCtx, tool, use, emit));
      }
      await vault.flush();
      names = await this.directory.displayNames(ctx.salonId, vault, ctx.permissions, input.locale);
      const resultMessage: Param = { role: "user", content: results };
      await this.persist(ctx.salonId, conversation.id, resultMessage);
      messages.push(resultMessage);
    }
    const usage = await this.meter.usage(ctx.salonId);
    emit({ type: "done", usedVnd: usage.usedVnd, model: route.model });
  }

  private async conversation(ctx: SalonContext, userId: string, input: AssistantTurnInputParsed) {
    if (input.conversationId) {
      const found = await this.prisma.assistantConversation.findFirst({
        where: { id: input.conversationId, salonId: ctx.salonId, userId, deletedAt: null },
      });
      if (!found) {
        throw new AppError(404, ASSISTANT_ERRORS.conversationNotFound, "Conversation not found");
      }
      return found;
    }
    return this.prisma.assistantConversation.create({
      data: { salonId: ctx.salonId, userId, locale: input.locale },
    });
  }

  private async history(conversationId: string, salonId: string): Promise<Param[]> {
    const rows = await this.prisma.assistantMessage.findMany({
      where: { conversationId, salonId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { role: true, content: true },
      take: 200,
    });
    return rows.map(
      (r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content }) as Param,
    );
  }

  private async persist(
    salonId: string,
    conversationId: string,
    message: Param,
    reply?: TurnMessage,
    route?: Route,
  ) {
    const usage = reply?.usage;
    await this.prisma.assistantMessage.create({
      data: {
        salonId,
        conversationId,
        role: message.role,
        content: message.content as object,
        model: route?.model ?? null,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
        costVnd: reply && route ? costVnd(route.model, tokenUsage(reply), this.fx) : 0,
        stopReason: reply?.stop_reason ?? null,
      },
    });
  }

  /**
   * One metered model call. Egress check first: if user-side content still contains a contact
   * detail or a known name, nothing is sent. Cost settles like the AI import (security review).
   */
  private async callModel(
    ctx: SalonContext,
    route: Route,
    tools: AssistantTool[],
    messages: Param[],
    directory: Directory,
    onText: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<TurnMessage> {
    const userSide = JSON.stringify(messages.filter((m) => m.role === "user"));
    if (containsPersonalData(userSide, directory)) {
      this.logger.warn({ salonId: ctx.salonId }, "assistant egress check blocked a request");
      throw new AppError(422, ASSISTANT_ERRORS.privacyBlocked, "Request blocked by privacy check");
    }
    const body: TurnBody = {
      model: route.model,
      max_tokens: route.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: route.effort },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [...tools.map(toModelTool), ...(route.name === "fast" ? [ESCALATE] : [])],
      tool_choice: { type: "auto" },
      messages,
      ...(route.serverFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    };
    const worstCase = costVnd(
      route.model,
      {
        inputTokens: Math.ceil(JSON.stringify(body).length / 3),
        outputTokens: route.maxTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      this.fx,
    );
    const reservation = await this.meter.reserve(ctx.salonId, worstCase);
    try {
      const reply = await this.llm.turn(body, onText, signal);
      await this.meter.commit(reservation, costVnd(route.model, tokenUsage(reply), this.fx));
      return reply;
    } catch (error) {
      await this.settleFailure(reservation, error);
      throw new AppError(502, ASSISTANT_ERRORS.failed, "Assistant request failed", {
        cause: error,
      });
    }
  }

  private async settleFailure(reservation: CostReservation, error: unknown) {
    const failure = classifyProviderError(error);
    if (failure.billing === "maybe_billed")
      await this.meter.commit(reservation, reservation.amountVnd);
    else await this.meter.release(reservation);
  }

  /** Runs one tool behind permission, input validation and the allowlist check; always audited. */
  private async runTool(
    ctx: SalonContext,
    conversationId: string,
    toolCtx: ToolContext,
    tool: AssistantTool | undefined,
    use: Anthropic.Beta.Messages.BetaToolUseBlock,
    emit: Emit,
  ): Promise<Block> {
    const started = Date.now();
    const audit = async (status: "ok" | "withheld" | "forbidden" | "error", output?: string) => {
      await this.prisma.assistantToolCall.create({
        data: {
          salonId: ctx.salonId,
          conversationId,
          toolName: use.name.slice(0, 64),
          input: use.input ?? {},
          status,
          outputDigest: output
            ? createHash("sha256").update(output).digest("hex").slice(0, 32)
            : null,
          latencyMs: Date.now() - started,
        },
      });
    };
    const fail = async (
      status: "withheld" | "forbidden" | "error",
      code: string,
    ): Promise<Block> => {
      await audit(status);
      return {
        type: "tool_result",
        tool_use_id: use.id,
        is_error: true,
        content: JSON.stringify({ error: code }),
      };
    };
    if (!tool || !ctx.permissions.has(tool.permission)) return fail("forbidden", "forbidden");
    const parsed = tool.input.safeParse(use.input);
    if (!parsed.success) return fail("error", "invalid_input");
    let output: unknown;
    try {
      output = await tool.handler(toolCtx, parsed.data);
    } catch (error) {
      if (error instanceof ToolInputError) return fail("error", error.message);
      this.logger.error({ err: error, tool: tool.name }, "assistant tool failed");
      return fail("error", "unavailable");
    }
    const checked = checkToolResult(tool.output, output);
    if (!checked.ok) {
      this.logger.error(
        { tool: tool.name, path: checked.path, reason: checked.reason },
        "pii_firewall_block",
      );
      return fail("withheld", "result_withheld");
    }
    const json = JSON.stringify(checked.value);
    await audit("ok", json);
    const period = tool.period?.(parsed.data);
    emit({ type: "source", tool: tool.name, from: period?.from ?? null, to: period?.to ?? null });
    return { type: "tool_result", tool_use_id: use.id, content: json };
  }

  private rehydrate(text: string, names: Map<string, string>): string {
    const r = new StreamRehydrator((t) => names.get(t));
    return r.push(text) + r.flush();
  }

  private get fx(): number {
    return this.config.env.AI_USD_TO_VND;
  }
}

function tokenUsage(reply: TurnMessage) {
  return {
    inputTokens: reply.usage.input_tokens,
    outputTokens: reply.usage.output_tokens,
    cacheReadTokens: reply.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: reply.usage.cache_creation_input_tokens ?? 0,
  };
}
