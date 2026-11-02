import { nativeTokensSchema, type Problem, problemSchema } from "@gugu/contracts";

import { API_URL, AUTH_CLIENT } from "./config";
import { tokenStore } from "./token-store";

/** API failure carrying the stable problem+json `code` (the UI translates it). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly problem: Problem | null,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

let refreshing: Promise<boolean> | null = null;

/** Native only: rotate the refresh token once, shared by concurrent callers. */
async function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const tokens = await tokenStore.getTokens();
    if (!tokens) return false;
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) {
      await tokenStore.clear();
      return false;
    }
    await tokenStore.setTokens(nativeTokensSchema.parse(await res.json()));
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Fetch wrapper for the GuGu API. Web: sends the session cookie (`credentials: include`) and the
 * CSRF header on writes. Native: bearer token, one transparent refresh on 401.
 */
export async function apiFetch<T>(
  path: string,
  opts: {
    method?: Method;
    body?: unknown;
    locale?: string;
    retried?: boolean;
    /** Extra request headers, e.g. `Idempotency-Key` for booking writes (topic 06). */
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
  // FormData (file uploads) sets its own multipart content type with the boundary.
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers["content-type"] = "application/json";
  if (opts.locale) headers["accept-language"] = opts.locale;
  if (AUTH_CLIENT === "web") {
    const csrf = tokenStore.getCsrf();
    if (csrf && method !== "GET") headers["x-csrf-token"] = csrf;
  } else {
    const tokens = await tokenStore.getTokens();
    if (tokens) headers["authorization"] = `Bearer ${tokens.accessToken}`;
  }
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers,
    credentials: AUTH_CLIENT === "web" ? "include" : "omit",
    ...(opts.body !== undefined
      ? { body: isForm ? (opts.body as FormData) : JSON.stringify(opts.body) }
      : {}),
  });
  if (res.status === 401 && AUTH_CLIENT === "native" && !opts.retried && (await refreshTokens())) {
    return apiFetch<T>(path, { ...opts, retried: true });
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const problem = problemSchema.safeParse(json).data ?? null;
    throw new ApiError(res.status, problem?.code ?? "common.internal_error", problem);
  }
  return json as T;
}

/**
 * Streaming POST (server-sent events) with the same auth rules as `apiFetch`. Calls `onData` with
 * each `data:` payload. Native uses `expo/fetch`, whose response body can be streamed.
 */
export async function apiStream(
  path: string,
  body: unknown,
  onData: (data: string) => void,
  opts: { signal?: AbortSignal; retried?: boolean } = {},
): Promise<void> {
  const headers: Record<string, string> = {
    accept: "text/event-stream",
    "content-type": "application/json",
  };
  if (AUTH_CLIENT === "web") {
    const csrf = tokenStore.getCsrf();
    if (csrf) headers["x-csrf-token"] = csrf;
  } else {
    const tokens = await tokenStore.getTokens();
    if (tokens) headers["authorization"] = `Bearer ${tokens.accessToken}`;
  }
  // expo/fetch streams response bodies on iOS/Android; the browser's fetch does on web.
  const doFetch = AUTH_CLIENT === "web" ? fetch : (await import("expo/fetch")).fetch;
  const res = await doFetch(`${API_URL}/api/v1${path}`, {
    method: "POST",
    headers,
    credentials: AUTH_CLIENT === "web" ? "include" : "omit",
    body: JSON.stringify(body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (res.status === 401 && AUTH_CLIENT === "native" && !opts.retried && (await refreshTokens())) {
    return apiStream(path, body, onData, { ...opts, retried: true });
  }
  if (!res.ok || !res.body) {
    const json: unknown = await res.json().catch(() => null);
    const problem = problemSchema.safeParse(json).data ?? null;
    throw new ApiError(res.status, problem?.code ?? "common.internal_error", problem);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut >= 0) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of event.split("\n")) {
        if (line.startsWith("data: ")) onData(line.slice(6));
      }
      cut = buffer.indexOf("\n\n");
    }
  }
}
