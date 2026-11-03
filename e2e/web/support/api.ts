// Minimal JSON client for seeding and API-side assertions (native client → bearer token, so no
// CSRF/cookies). Errors carry method, path, status and the problem body.
import { randomUUID } from "node:crypto";
import { API } from "./env";
import { latestMagicLink, searchMail } from "./mailpit";

export class ApiClient {
  constructor(private token = "") {}

  async call<T = unknown>(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(method !== "GET" && path.includes("/bookings")
          ? { "idempotency-key": `e2e-${randomUUID()}` }
          : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${path} → ${String(res.status)} ${text.slice(0, 400)}`);
    return json as T;
  }

  /** Signs in by magic link (read from Mailpit) as a native client. */
  static async signIn(email: string): Promise<ApiClient> {
    const before = (await searchMail(`to:"${email}"`)).length;
    await new ApiClient().call("/auth/magic-link", "POST", {
      email,
      locale: "vi",
      client: "native",
    });
    const link = await latestMagicLink(email, before);
    const token = new URL(link).searchParams.get("token") ?? "";
    const session = await new ApiClient().call<{ session: { tokens: { accessToken: string } } }>(
      "/auth/magic-link/verify",
      "POST",
      { token, client: "native" },
    );
    return new ApiClient(session.session.tokens.accessToken);
  }
}
