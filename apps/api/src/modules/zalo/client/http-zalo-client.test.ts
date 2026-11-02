import { describe, expect, it, vi } from "vitest";
import { HttpZaloClient, ZALO_ENDPOINTS } from "./http-zalo-client";
import { ZaloApiError } from "./zalo-client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("HttpZaloClient (request shapes, error mapping)", () => {
  it("builds the OAuth v4 permission URL with PKCE", () => {
    const url = new URL(
      new HttpZaloClient("app1", "sec").authorizeUrl({
        state: "st",
        codeChallenge: "ch",
        redirectUri: "https://api/cb",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(ZALO_ENDPOINTS.oauthPermission);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      app_id: "app1",
      redirect_uri: "https://api/cb",
      code_challenge: "ch",
      state: "st",
    });
  });

  it("exchanges the code with secret_key header and code_verifier", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({ access_token: "a", refresh_token: "r", expires_in: "90000" })),
    );
    const tokens = await new HttpZaloClient("app1", "sec", fetchImpl).exchangeCode({
      code: "c",
      codeVerifier: "v",
    });
    expect(tokens).toMatchObject({ accessToken: "a", refreshToken: "r" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ZALO_ENDPOINTS.oauthToken);
    expect((init.headers as Record<string, string>)["secret_key"]).toBe("sec");
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      code: "c",
      app_id: "app1",
      grant_type: "authorization_code",
      code_verifier: "v",
    });
  });

  it("sends consultation messages with hidden-payload buttons and maps Zalo errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: 0, data: { message_id: "m1" } }))
      .mockResolvedValueOnce(json({ error: -230, message: "not interacted in 7 days" }))
      .mockResolvedValueOnce(json({ error: -216, message: "invalid token" }))
      .mockResolvedValueOnce(json({}, 503));
    const client = new HttpZaloClient("app1", "sec", fetchImpl);
    const msg = {
      kind: "text" as const,
      text: "Hi",
      buttons: [{ title: "Book", payload: "gg|g|book" }],
    };
    await expect(client.sendCs("tok", "u1", msg)).resolves.toEqual({ messageId: "m1" });
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as unknown;
    expect(body).toEqual({
      recipient: { user_id: "u1" },
      message: {
        text: "Hi",
        attachment: {
          type: "template",
          payload: { buttons: [{ title: "Book", type: "oa.query.hide", payload: "gg|g|book" }] },
        },
      },
    });
    await expect(client.sendCs("tok", "u1", msg)).rejects.toMatchObject({ kind: "window_closed" });
    await expect(client.sendCs("tok", "u1", msg)).rejects.toMatchObject({ kind: "token_invalid" });
    const err = await client.sendCs("tok", "u1", msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZaloApiError);
    expect((err as ZaloApiError).retryable).toBe(true);
  });

  it("sends template messages by phone without the plus sign", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json({ error: 0, data: { msg_id: "z1" } })));
    await new HttpZaloClient("app1", "sec", fetchImpl).sendTemplate("tok", {
      phoneE164: "+84901234567",
      templateId: "123",
      data: { ref: "AB12" },
      trackingId: "log-1",
    });
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    ) as unknown;
    expect(body).toEqual({
      phone: "84901234567",
      template_id: "123",
      template_data: { ref: "AB12" },
      tracking_id: "log-1",
    });
  });
});
