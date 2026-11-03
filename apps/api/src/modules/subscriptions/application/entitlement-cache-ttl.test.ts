import { describe, expect, it } from "vitest";
import { ENTITLEMENT_CACHE_TTL_SECONDS } from "./entitlement-cache";
import { cacheTtl } from "./entitlement.service";

const now = new Date("2026-11-03T12:00:00Z");
const inSeconds = (s: number) => new Date(now.getTime() + s * 1000);

describe("cacheTtl", () => {
  it("uses the default TTL without boundaries", () => {
    expect(cacheTtl([null], now)).toBe(ENTITLEMENT_CACHE_TTL_SECONDS);
  });

  it("never caches past a trial end", () => {
    expect(cacheTtl([inSeconds(10)], now)).toBe(10);
  });

  it("is capped at the earliest active override expiry", () => {
    expect(cacheTtl([inSeconds(50), inSeconds(7), null, inSeconds(30)], now)).toBe(7);
  });

  it("returns 0 (do not cache) for a boundary at or before now", () => {
    expect(cacheTtl([inSeconds(0)], now)).toBe(0);
    expect(cacheTtl([inSeconds(-5)], now)).toBe(0);
  });
});
