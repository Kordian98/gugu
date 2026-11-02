import {
  type CsMessage,
  type OaTokens,
  type TemplateMessage,
  toZaloPhone,
  ZaloApiError,
  type ZaloClient,
  type ZaloErrorKind,
} from "./zalo-client";

/**
 * Real Zalo APIs. Endpoints and payload shapes follow developers.zalo.me / oa.zalo.me docs as of
 * 2026-11 ([3p] where marked in .claude/skills/zalo-integration/references/api-notes.md). They are
 * confirmed against a live OA in spike S-Z1 before go-live; only this file changes if they differ.
 */
export const ZALO_ENDPOINTS = {
  oauthPermission: "https://oauth.zaloapp.com/v4/oa/permission",
  oauthToken: "https://oauth.zaloapp.com/v4/oa/access_token",
  getOa: "https://openapi.zalo.me/v2.0/oa/getoa",
  userDetail: "https://openapi.zalo.me/v3.0/oa/user/detail",
  sendCs: "https://openapi.zalo.me/v3.0/oa/message/cs",
  sendTemplate: "https://business.openapi.zalo.me/message/template",
} as const;

const TIMEOUT_MS = 10_000;

/** Zalo OpenAPI error codes we act on ([3p]; unknown codes are permanent failures). */
const ERROR_KINDS: Record<number, ZaloErrorKind> = {
  [-216]: "token_invalid",
  [-124]: "token_invalid",
  [-230]: "window_closed",
  [-232]: "window_closed",
  [-213]: "user_unreachable",
  [-201]: "permanent",
  [-32]: "rate_limited",
  [-1124]: "quota_exceeded",
  [-1139]: "user_unreachable",
  [-1131]: "template_invalid",
  [-1132]: "template_invalid",
};

type Fetch = typeof fetch;

export class HttpZaloClient implements ZaloClient {
  readonly mode = "http" as const;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL(ZALO_ENDPOINTS.oauthPermission);
    url.searchParams.set("app_id", this.appId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  exchangeCode(input: { code: string; codeVerifier: string }): Promise<OaTokens> {
    return this.token({
      code: input.code,
      app_id: this.appId,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
    });
  }

  refresh(refreshToken: string): Promise<OaTokens> {
    return this.token({
      refresh_token: refreshToken,
      app_id: this.appId,
      grant_type: "refresh_token",
    });
  }

  async getOa(accessToken: string): Promise<{ oaId: string; name: string }> {
    const data = await this.openApi<{ oa_id?: string | number; name?: string }>(
      ZALO_ENDPOINTS.getOa,
      {
        method: "GET",
        headers: { access_token: accessToken },
      },
    );
    if (data.oa_id === undefined) throw new ZaloApiError("permanent", "getoa: no oa_id");
    return { oaId: String(data.oa_id), name: data.name ?? "" };
  }

  async getUserName(accessToken: string, userId: string): Promise<string | null> {
    const url = new URL(ZALO_ENDPOINTS.userDetail);
    url.searchParams.set("data", JSON.stringify({ user_id: userId }));
    const data = await this.openApi<{ display_name?: string }>(url.toString(), {
      method: "GET",
      headers: { access_token: accessToken },
    });
    return data.display_name ?? null;
  }

  async sendCs(
    accessToken: string,
    userId: string,
    message: CsMessage,
  ): Promise<{ messageId: string }> {
    const body = { recipient: { user_id: userId }, message: csPayload(message) };
    const data = await this.openApi<{ message_id?: string }>(ZALO_ENDPOINTS.sendCs, {
      method: "POST",
      headers: { access_token: accessToken, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { messageId: data.message_id ?? "" };
  }

  async sendTemplate(
    accessToken: string,
    message: TemplateMessage,
  ): Promise<{ messageId: string }> {
    const data = await this.openApi<{ msg_id?: string }>(ZALO_ENDPOINTS.sendTemplate, {
      method: "POST",
      headers: { access_token: accessToken, "content-type": "application/json" },
      body: JSON.stringify({
        phone: toZaloPhone(message.phoneE164),
        template_id: message.templateId,
        template_data: message.data,
        tracking_id: message.trackingId,
      }),
    });
    return { messageId: data.msg_id ?? "" };
  }

  private async token(form: Record<string, string>): Promise<OaTokens> {
    const res = await this.call(ZALO_ENDPOINTS.oauthToken, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", secret_key: this.appSecret },
      body: new URLSearchParams(form).toString(),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: string | number;
      error?: number;
      error_name?: string;
    };
    if (!json.access_token || !json.refresh_token) {
      // invalid_grant & co. are permanent: the owner has to connect again.
      throw new ZaloApiError(
        "token_invalid",
        `oauth: ${json.error_name ?? "no token"}`,
        json.error ?? null,
      );
    }
    const seconds = Number(json.expires_in ?? 3600);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000),
    };
  }

  private async openApi<T>(url: string, init: RequestInit): Promise<T> {
    const res = await this.call(url, init);
    const json = (await res.json()) as { error?: number; message?: string; data?: T };
    if (json.error !== undefined && json.error !== 0) {
      const kind = ERROR_KINDS[json.error] ?? "permanent";
      throw new ZaloApiError(kind, `zalo ${String(json.error)}: ${json.message ?? ""}`, json.error);
    }
    return json.data ?? ({} as T);
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new ZaloApiError("transient", `network: ${(error as Error).message}`);
    }
    if (res.status === 429) throw new ZaloApiError("rate_limited", "HTTP 429");
    if (res.status >= 500) throw new ZaloApiError("transient", `HTTP ${String(res.status)}`);
    if (!res.ok) throw new ZaloApiError("permanent", `HTTP ${String(res.status)}`);
    return res;
  }
}

/** Our message → Zalo v3 `message` object ([3p] button/request_user_info template shapes). */
export function csPayload(message: CsMessage): Record<string, unknown> {
  if (message.kind === "request_info") {
    return {
      attachment: {
        type: "template",
        payload: {
          template_type: "request_user_info",
          elements: [{ title: message.title, subtitle: message.subtitle }],
        },
      },
    };
  }
  if (message.buttons.length === 0) return { text: message.text };
  return {
    text: message.text,
    attachment: {
      type: "template",
      payload: {
        buttons: message.buttons.map((b) => ({
          title: b.title,
          type: "oa.query.hide",
          payload: b.payload,
        })),
      },
    },
  };
}
