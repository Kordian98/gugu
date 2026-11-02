import { describe, expect, it } from "vitest";
import { TokenCipher } from "./token-cipher";

describe("TokenCipher", () => {
  const cipher = new TokenCipher("k".repeat(40));

  it("round-trips and never stores the plain token", () => {
    const sealed = cipher.encrypt("access-token-123");
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("access-token-123");
    expect(cipher.decrypt(sealed)).toBe("access-token-123");
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = cipher.encrypt("secret");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => cipher.decrypt(parts.join("."))).toThrow();
    expect(() => new TokenCipher("x".repeat(40)).decrypt(sealed)).toThrow();
    expect(() => cipher.decrypt("v0.a.b.c")).toThrow();
  });
});
