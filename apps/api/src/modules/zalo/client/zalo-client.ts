import type { BotButton } from "../domain/bot/types";

/**
 * Port to Zalo (OA OpenAPI v3, OAuth v4, ZBS Template Message). Implementations:
 * HttpZaloClient (real Zalo), EmulatedZaloClient (built-in emulator), DisabledZaloClient.
 * Selected by ZALO_CLIENT; nothing else in the module knows which one runs.
 */
export const ZALO_CLIENT = Symbol("ZALO_CLIENT");

export interface OaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export type CsMessage =
  | { kind: "text"; text: string; buttons: BotButton[] }
  | { kind: "request_info"; title: string; subtitle: string };

export interface TemplateMessage {
  /** E.164 (+84…); sent to Zalo as 84… */
  phoneE164: string;
  templateId: string;
  data: Record<string, string>;
  /** Our send-log id, echoed back by Zalo in delivery events. */
  trackingId: string;
}

export type ZaloErrorKind =
  | "token_invalid"
  | "window_closed"
  | "quota_exceeded"
  | "template_invalid"
  | "user_unreachable"
  | "rate_limited"
  | "transient"
  | "permanent";

/** A Zalo call failed. `retryable` tells the send queue whether to back off and retry. */
export class ZaloApiError extends Error {
  constructor(
    readonly kind: ZaloErrorKind,
    message: string,
    readonly zaloCode: number | null = null,
  ) {
    super(message);
    this.name = "ZaloApiError";
  }

  get retryable(): boolean {
    return this.kind === "transient" || this.kind === "rate_limited";
  }
}

export interface ZaloClient {
  readonly mode: "emulated" | "http" | "disabled";
  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<OaTokens>;
  refresh(refreshToken: string): Promise<OaTokens>;
  getOa(accessToken: string): Promise<{ oaId: string; name: string }>;
  /** Display name of a user who interacted with the OA (null when Zalo does not share it). */
  getUserName(accessToken: string, userId: string): Promise<string | null>;
  sendCs(accessToken: string, userId: string, message: CsMessage): Promise<{ messageId: string }>;
  sendTemplate(accessToken: string, message: TemplateMessage): Promise<{ messageId: string }>;
}

export class DisabledZaloClient implements ZaloClient {
  readonly mode = "disabled" as const;
  private fail(): never {
    throw new ZaloApiError("permanent", "Zalo integration is disabled (ZALO_CLIENT=disabled)");
  }
  authorizeUrl(): string {
    return this.fail();
  }
  exchangeCode(): Promise<OaTokens> {
    return this.fail();
  }
  refresh(): Promise<OaTokens> {
    return this.fail();
  }
  getOa(): Promise<{ oaId: string; name: string }> {
    return this.fail();
  }
  getUserName(): Promise<string | null> {
    return this.fail();
  }
  sendCs(): Promise<{ messageId: string }> {
    return this.fail();
  }
  sendTemplate(): Promise<{ messageId: string }> {
    return this.fail();
  }
}

/** Zalo wants `84xxxxxxxxx` (no plus). */
export const toZaloPhone = (e164: string): string => e164.replace(/^\+/, "");
