import {
  Body,
  type CanActivate,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Injectable,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { Public } from "../../../common/guards/auth-policy";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { ZaloClock } from "../application/zalo-clock";
import { computeZaloSignature, ZALO_SIGNATURE_HEADER } from "../domain/signature";
import { consentPage, simulatorPage } from "./emulator-pages";
import { EMULATOR_APP_ID, EmulatorStore } from "./emulator-store";

/** Emulator routes exist only with ZALO_CLIENT=emulated outside production (404 otherwise). */
@Injectable()
export class EmulatorOnlyGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}
  canActivate(): boolean {
    if (this.config.env.ZALO_CLIENT !== "emulated" || this.config.isProduction) {
      throw new AppError(404, COMMON_ERRORS.notFound, "Not found");
    }
    return true;
  }
}

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w.-]+$/);

const consentQuery = z.object({
  app_id: z.string(),
  redirect_uri: z.url(),
  code_challenge: z.string().min(16).max(128),
  state: z.string().min(1).max(256),
});

const approveBody = z.object({
  redirect_uri: z.url(),
  code_challenge: z.string().min(16).max(128),
  state: z.string().min(1).max(256),
  oa_id: id,
  oa_name: z.string().trim().min(1).max(80),
  decision: z.enum(["allow", "deny"]),
});

export const emulatorEventSchema = z.object({
  oaId: id,
  userId: id,
  event: z.enum([
    "follow",
    "unfollow",
    "user_send_text",
    "user_send_sticker",
    "user_send_image",
    "user_submit_info",
  ]),
  /** Text, or a button payload (`gg|…`) — a tap on a hidden-payload button arrives as text. */
  text: z.string().max(2000).optional(),
  name: z.string().max(80).optional(),
  phone: z.string().max(20).optional(),
});
export type EmulatorEvent = z.infer<typeof emulatorEventSchema>;

const faultsSchema = z.object({
  expireTokens: z.boolean().optional(),
  refreshFails: z.boolean().optional(),
  failNext: z.number().int().min(0).max(50).optional(),
  quotaExceeded: z.boolean().optional(),
  templateRejected: z.boolean().optional(),
});

/**
 * Built-in Zalo emulator (dev/test): OAuth consent page, signed webhook events, outbox of every
 * message "Zalo" received from us, fault injection, and a chat simulator page at
 * `/api/v1/dev/zalo-emulator` to talk to a salon's bot like a customer would.
 */
@ApiExcludeController()
@UseGuards(EmulatorOnlyGuard)
@Controller("dev/zalo-emulator")
export class ZaloEmulatorController {
  constructor(
    private readonly store: EmulatorStore,
    private readonly config: AppConfig,
    private readonly clock: ZaloClock,
  ) {}

  @Get()
  @Public()
  @Header("content-type", "text/html; charset=utf-8")
  simulator(): string {
    return simulatorPage();
  }

  @Get("oauth/permission")
  @Public()
  @Header("content-type", "text/html; charset=utf-8")
  consent(@Query({ schema: consentQuery }) q: z.infer<typeof consentQuery>): string {
    if (q.app_id !== EMULATOR_APP_ID)
      throw new AppError(400, COMMON_ERRORS.badRequest, "Unknown app");
    return consentPage(q);
  }

  @Post("oauth/permission")
  @Public()
  async approve(
    @Body({ schema: approveBody }) body: z.infer<typeof approveBody>,
    @Res() res: Response,
  ) {
    const target = new URL(body.redirect_uri);
    const allowed = [this.config.env.API_PUBLIC_URL, EmulatorStore.webhookUrl]
      .filter(Boolean)
      .map((u) => new URL(u ?? "").origin);
    if (!allowed.includes(target.origin)) {
      throw new AppError(400, COMMON_ERRORS.badRequest, "redirect_uri must be this API");
    }
    target.searchParams.set("state", body.state);
    if (body.decision === "allow") {
      await this.store.saveOa(body.oa_id, body.oa_name);
      target.searchParams.set("code", await this.store.createCode(body.oa_id, body.code_challenge));
      target.searchParams.set("oa_id", body.oa_id);
    }
    res.redirect(302, target.toString());
  }

  /** Sends one customer event to our webhook, signed exactly like Zalo does. */
  @Post("events")
  @Public()
  @HttpCode(200)
  async event(
    @Body({ schema: emulatorEventSchema }) body: EmulatorEvent,
  ): Promise<{ status: number; body: unknown }> {
    return this.deliver(body);
  }

  async deliver(body: EmulatorEvent): Promise<{ status: number; body: unknown }> {
    const now = this.clock.now();
    const timestamp = String(now.getTime());
    const msgId = `emu_${timestamp}_${Math.random().toString(36).slice(2, 10)}`;
    const base = { app_id: EMULATOR_APP_ID, timestamp, user_id_by_app: `app_${body.userId}` };
    const payload =
      body.event === "follow" || body.event === "unfollow"
        ? {
            ...base,
            event_name: body.event,
            oa_id: body.oaId,
            follower: { id: body.userId },
            source: "emulator",
          }
        : body.event === "user_submit_info"
          ? {
              ...base,
              event_name: body.event,
              sender: { id: body.userId },
              recipient: { id: body.oaId },
              info: { name: body.name ?? "", phone: body.phone ?? "" },
            }
          : {
              ...base,
              event_name: body.event,
              sender: { id: body.userId },
              recipient: { id: body.oaId },
              message: {
                msg_id: msgId,
                text: body.event === "user_send_text" ? (body.text ?? "") : undefined,
              },
            };
    if (body.event !== "unfollow") await this.store.touch(body.oaId, body.userId, now, body.name);
    const raw = JSON.stringify(payload);
    const mac = computeZaloSignature({
      appId: EMULATOR_APP_ID,
      rawBody: raw,
      timestamp,
      secret: this.config.env.ZALO_OA_SECRET_KEY,
    });
    const api = EmulatorStore.webhookUrl ?? this.config.env.API_PUBLIC_URL;
    const res = await fetch(`${api}/api/v1/integrations/zalo/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", [ZALO_SIGNATURE_HEADER]: `mac=${mac}` },
      body: raw,
    });
    const text = await res.text();
    return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
  }

  @Get("oas")
  @Public()
  async oas() {
    const oas = await this.store.oas();
    return Promise.all(
      Object.entries(oas).map(async ([oaId, name]) => ({
        oaId,
        name,
        users: await this.store.users(oaId),
      })),
    );
  }

  @Get("outbox")
  @Public()
  async outbox(
    @Query({ schema: z.object({ oaId: id, userId: id.optional() }) })
    q: {
      oaId: string;
      userId?: string;
    },
  ) {
    return this.store.outbox(q.oaId, q.userId);
  }

  @Put("faults/:oaId")
  @Public()
  @HttpCode(204)
  async faults(
    @Param({ schema: z.object({ oaId: id }) }) p: { oaId: string },
    @Body({ schema: faultsSchema }) body: z.infer<typeof faultsSchema>,
  ): Promise<void> {
    await this.store.setFaults(p.oaId, body);
  }

  @Delete("oas/:oaId/state")
  @Public()
  @HttpCode(204)
  async clear(@Param({ schema: z.object({ oaId: id }) }) p: { oaId: string }): Promise<void> {
    await this.store.clear(p.oaId);
  }
}
