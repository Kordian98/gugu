import { Controller, Get, Headers, HttpCode, Post, Query, Req, Res } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { Public } from "../../../common/guards/auth-policy";
import { ConnectionService } from "../application/connection.service";
import { WebhookIngestService } from "../application/webhook-ingest.service";
import { ZALO_SIGNATURE_HEADER } from "../domain/signature";

const callbackQuery = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(256).optional(),
  oa_id: z.string().max(64).optional(),
});

/**
 * Zalo-facing endpoints: the single webhook for all salon OAs and the OAuth redirect. Public by
 * design — authenticity comes from the webhook signature and the one-time OAuth state.
 */
@ApiTags("zalo")
@Controller("integrations/zalo")
export class ZaloWebhookController {
  constructor(
    private readonly ingest: WebhookIngestService,
    private readonly connections: ConnectionService,
  ) {}

  @Post("webhook")
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: "zalo.webhook",
    summary: "Zalo OA webhook (signed; X-ZEvent-Signature).",
  })
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers(ZALO_SIGNATURE_HEADER) signature: string | undefined,
  ): Promise<{ ok: true }> {
    await this.ingest.ingest(req.rawBody, signature);
    return { ok: true };
  }

  @Get("oauth/callback")
  @Public()
  @ApiExcludeEndpoint()
  async callback(
    @Query({ schema: callbackQuery }) q: z.infer<typeof callbackQuery>,
    @Res() res: Response,
  ) {
    const next = await this.connections.callback({ code: q.code, state: q.state });
    res.redirect(302, next);
  }
}
