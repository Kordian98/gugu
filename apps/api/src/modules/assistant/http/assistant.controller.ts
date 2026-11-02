import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  ASSISTANT_ERRORS,
  type AssistantEvent,
  type AssistantStatus,
  assistantStatusSchema,
  type AssistantTurnInputParsed,
  assistantTurnInputSchema,
  problemSchema,
  salonParamsSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import {
  type RateLimitRule,
  RateLimitService,
} from "../../../infrastructure/rate-limit/rate-limit.service";
import { RequiresEntitlement } from "../../subscriptions/subscriptions.facade";
import { AssistantService } from "../application/assistant.service";

export const ASSISTANT_RATE_LIMIT: RateLimitRule = {
  name: "assistant.turn.user",
  limit: 60,
  windowSeconds: 3600,
};

/** AI business assistant (topic 08 A2): status and one streamed chat turn. */
@ApiTags("assistant")
@Controller("salons/:salonId/assistant")
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly rateLimits: RateLimitService,
  ) {}

  @Get()
  @RequirePermission("salon.read")
  @ApiOperation({
    operationId: "assistant.status",
    summary: "Whether the assistant is configured, in the plan, and allowed for this member.",
  })
  @ApiResponse({ status: 200, description: "Status.", standardSchema: assistantStatusSchema })
  async status(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<AssistantStatus> {
    return this.assistant.status(salon);
  }

  @Post("turns")
  @RequirePermission("assistant.use")
  @RequiresEntitlement("ai.agent.enabled")
  @ApiProduces("text/event-stream")
  @ApiOperation({
    operationId: "assistant.turn",
    summary:
      "Ask the assistant. Streams server-sent events (conversation, masked, source, delta, done | error). The model sees only tokens and aggregates, never personal data.",
  })
  @ApiResponse({ status: 200, description: "Event stream (one JSON `data:` line per event)." })
  @ApiResponse({ status: 429, description: "Rate limit or AI cap.", standardSchema: problemSchema })
  @ApiResponse({ status: 503, description: "Not configured.", standardSchema: problemSchema })
  async turn(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: assistantTurnInputSchema }) body: AssistantTurnInputParsed,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Failures before the first byte are normal problem+json responses.
    await this.assistant.preflight(salon);
    await this.rateLimits.consume(ASSISTANT_RATE_LIMIT, `${salon.salonId}:${user.userId}`);

    const abort = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    res.status(200);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("x-accel-buffering", "no");
    res.flushHeaders();
    const emit = (event: AssistantEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      await this.assistant.turn(salon, user.userId, body, emit, abort.signal);
    } catch (error) {
      emit({
        type: "error",
        code: error instanceof AppError ? error.code : ASSISTANT_ERRORS.failed,
      });
    } finally {
      res.end();
    }
  }
}
