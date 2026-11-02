import Anthropic from "@anthropic-ai/sdk";

/**
 * Whether a failed LLM call may have been billed, and whether to try again (security review of
 * 08-IMP). The cost meter releases a reservation only for `not_sent` and `rejected`; every other
 * failure commits the reserved worst case, because the provider may have run (and billed) it.
 *
 * - `not_sent`: the connection never opened (refused, DNS, unreachable), so nothing reached the provider.
 * - `rejected`: the provider answered with a 4xx before running the model (invalid request, auth,
 *   permission, size, rate limit). Anthropic does not bill rejected requests.
 * - `maybe_billed`: timeouts, aborts, dropped connections, 5xx/overloaded, anything unknown.
 */
export type ProviderBilling = "not_sent" | "rejected" | "maybe_billed";

export interface ProviderFailure {
  billing: ProviderBilling;
  retryable: boolean;
}

const NOT_SENT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function classifyProviderError(error: unknown): ProviderFailure {
  // Order matters: abort and timeout are subclasses of APIError / APIConnectionError.
  if (error instanceof Anthropic.APIUserAbortError) {
    return { billing: "maybe_billed", retryable: false };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { billing: "maybe_billed", retryable: true };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { billing: connectionNeverOpened(error) ? "not_sent" : "maybe_billed", retryable: true };
  }
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    const status = error.status;
    if (status === 429) return { billing: "rejected", retryable: true };
    if (status === 408) return { billing: "maybe_billed", retryable: true };
    if (status >= 400 && status < 500) return { billing: "rejected", retryable: false };
    return { billing: "maybe_billed", retryable: true };
  }
  return { billing: "maybe_billed", retryable: false };
}

/** Walks the `cause` chain for a socket error code that proves the request was never sent. */
function connectionNeverOpened(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NOT_SENT_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
