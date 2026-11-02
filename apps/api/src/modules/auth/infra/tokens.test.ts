import { describe, expect, it } from "vitest";
import { ipPrefix, randomCode, randomToken, safeEqual, tokenHash } from "./tokens";

describe("auth tokens", () => {
  it("creates long random tokens and 6-digit codes", () => {
    expect(randomToken()).toMatch(/^[\w-]{43}$/);
    expect(randomCode()).toMatch(/^\d{6}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it("separates hash purposes", () => {
    expect(tokenHash("k".repeat(32), "session", "x")).not.toBe(
      tokenHash("k".repeat(32), "refresh", "x"),
    );
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("truncates IPs", () => {
    expect(ipPrefix("203.0.113.77")).toBe("203.0.113.0/24");
    expect(ipPrefix("::ffff:10.1.2.3")).toBe("10.1.2.0/24");
    expect(ipPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(ipPrefix(undefined)).toBeNull();
  });
});
