import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { classifyProviderError } from "./provider-errors";

const status = (code: number) =>
  Anthropic.APIError.generate(code, { error: { type: "x" } }, "failed", new Headers());
const socket = (code: string) =>
  new Anthropic.APIConnectionError({
    cause: Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error(code), { code }),
    }),
  });

describe("classifyProviderError", () => {
  it("releases only when the connection never opened", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH"]) {
      expect(classifyProviderError(socket(code))).toEqual({ billing: "not_sent", retryable: true });
    }
  });

  it("treats dropped connections, timeouts and aborts as possibly billed", () => {
    expect(classifyProviderError(socket("ECONNRESET"))).toEqual({
      billing: "maybe_billed",
      retryable: true,
    });
    expect(classifyProviderError(new Anthropic.APIConnectionError({}))).toEqual({
      billing: "maybe_billed",
      retryable: true,
    });
    expect(classifyProviderError(new Anthropic.APIConnectionTimeoutError())).toEqual({
      billing: "maybe_billed",
      retryable: true,
    });
    expect(classifyProviderError(new Anthropic.APIUserAbortError())).toEqual({
      billing: "maybe_billed",
      retryable: false,
    });
  });

  it("treats 4xx as rejected (unbilled), retrying only rate limits", () => {
    for (const code of [400, 401, 403, 404, 413, 422]) {
      expect(classifyProviderError(status(code))).toEqual({
        billing: "rejected",
        retryable: false,
      });
    }
    expect(classifyProviderError(status(429))).toEqual({ billing: "rejected", retryable: true });
  });

  it("treats 5xx/overloaded and request timeouts as possibly billed and retryable", () => {
    for (const code of [408, 500, 502, 529]) {
      expect(classifyProviderError(status(code))).toEqual({
        billing: "maybe_billed",
        retryable: true,
      });
    }
  });

  it("is conservative for unknown errors", () => {
    expect(classifyProviderError(new Error("?"))).toEqual({
      billing: "maybe_billed",
      retryable: false,
    });
  });
});
