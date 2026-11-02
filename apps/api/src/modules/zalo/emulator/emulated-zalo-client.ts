import {
  type CsMessage,
  type OaTokens,
  type TemplateMessage,
  ZaloApiError,
  type ZaloClient,
} from "../client/zalo-client";
import type { ZaloClock } from "../application/zalo-clock";
import { PAID_WINDOW_MS } from "../domain/window";
import { EMULATOR_APP_ID, type EmulatorStore, s256 } from "./emulator-store";

/**
 * ZaloClient against the built-in emulator: same contract and failure modes as real Zalo (PKCE
 * check, single-use refresh tokens, 7-day consultation window, quota/template errors, 5xx), so the
 * whole integration runs locally and in CI without a Zalo account.
 */
export class EmulatedZaloClient implements ZaloClient {
  readonly mode = "emulated" as const;

  constructor(
    private readonly store: EmulatorStore,
    private readonly clock: ZaloClock,
    private readonly apiPublicUrl: string,
  ) {}

  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL(`${this.apiPublicUrl}/api/v1/dev/zalo-emulator/oauth/permission`);
    url.searchParams.set("app_id", EMULATOR_APP_ID);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  async exchangeCode(input: { code: string; codeVerifier: string }): Promise<OaTokens> {
    const code = await this.store.consumeCode(input.code);
    if (!code || s256(input.codeVerifier) !== code.codeChallenge) {
      throw new ZaloApiError("token_invalid", "oauth: invalid_grant");
    }
    return this.store.issueTokens(code.oaId, this.clock.now());
  }

  async refresh(refreshToken: string): Promise<OaTokens> {
    const oaId = await this.store.consumeRefresh(refreshToken);
    if (!oaId || (await this.store.faults(oaId)).refreshFails) {
      throw new ZaloApiError("token_invalid", "oauth: invalid refresh token");
    }
    return this.store.issueTokens(oaId, this.clock.now());
  }

  async getOa(accessToken: string): Promise<{ oaId: string; name: string }> {
    const oaId = await this.auth(accessToken);
    return { oaId, name: (await this.store.oas())[oaId] ?? oaId };
  }

  async getUserName(accessToken: string, userId: string): Promise<string | null> {
    const oaId = await this.auth(accessToken);
    return this.store.userName(oaId, userId);
  }

  async sendCs(
    accessToken: string,
    userId: string,
    message: CsMessage,
  ): Promise<{ messageId: string }> {
    const oaId = await this.auth(accessToken);
    if (await this.store.takeFailure(oaId))
      throw new ZaloApiError("transient", "HTTP 503 (emulated)");
    const last = await this.store.lastInteraction(oaId, userId);
    if (!last || this.clock.now().getTime() - last.getTime() > PAID_WINDOW_MS) {
      throw new ZaloApiError("window_closed", "zalo -230: user has not interacted in 7 days", -230);
    }
    const entry = await this.store.record({
      at: this.clock.now().toISOString(),
      oaId,
      channel: "cs",
      userId,
      phone: null,
      message,
      templateId: null,
      data: null,
    });
    return { messageId: entry.id };
  }

  async sendTemplate(
    accessToken: string,
    message: TemplateMessage,
  ): Promise<{ messageId: string }> {
    const oaId = await this.auth(accessToken);
    if (await this.store.takeFailure(oaId))
      throw new ZaloApiError("transient", "HTTP 503 (emulated)");
    const faults = await this.store.faults(oaId);
    if (faults.quotaExceeded) throw new ZaloApiError("quota_exceeded", "zalo -1124: quota", -1124);
    if (faults.templateRejected) {
      throw new ZaloApiError("template_invalid", "zalo -1131: template not approved", -1131);
    }
    const entry = await this.store.record({
      at: this.clock.now().toISOString(),
      oaId,
      channel: "template",
      userId: null,
      phone: message.phoneE164,
      message: null,
      templateId: message.templateId,
      data: message.data,
    });
    return { messageId: entry.id };
  }

  private async auth(accessToken: string): Promise<string> {
    const oaId = await this.store.oaForToken(accessToken, this.clock.now());
    if (!oaId) throw new ZaloApiError("token_invalid", "zalo -216: access token invalid", -216);
    if ((await this.store.faults(oaId)).expireTokens) {
      throw new ZaloApiError("token_invalid", "zalo -216: access token expired (fault)", -216);
    }
    return oaId;
  }
}
