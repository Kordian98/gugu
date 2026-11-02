import { describe, expect, it } from "vitest";
import { computeZaloSignature, isFreshTimestamp, verifyZaloSignature } from "./signature";

const input = {
  appId: "app1",
  rawBody: '{"a":1}',
  timestamp: "1767000000000",
  secret: "s".repeat(20),
};

describe("Zalo webhook signature", () => {
  it("accepts the right mac (with or without the mac= prefix) and rejects anything else", () => {
    const mac = computeZaloSignature(input);
    expect(verifyZaloSignature(`mac=${mac}`, input)).toBe(true);
    expect(verifyZaloSignature(mac.toUpperCase(), input)).toBe(true);
    expect(verifyZaloSignature(undefined, input)).toBe(false);
    expect(verifyZaloSignature("mac=zz", input)).toBe(false);
    expect(verifyZaloSignature(`mac=${mac}`, { ...input, rawBody: '{"a":2}' })).toBe(false);
    expect(verifyZaloSignature(`mac=${mac}`, { ...input, secret: "x".repeat(20) })).toBe(false);
  });

  it("rejects stale and future timestamps", () => {
    const now = new Date(1_767_000_000_000);
    expect(isFreshTimestamp("1767000000000", now)).toBe(true);
    expect(isFreshTimestamp(String(1_767_000_000_000 - 6 * 60_000), now)).toBe(false);
    expect(isFreshTimestamp(String(1_767_000_000_000 + 6 * 60_000), now)).toBe(false);
    expect(isFreshTimestamp("nope", now)).toBe(false);
  });
});
