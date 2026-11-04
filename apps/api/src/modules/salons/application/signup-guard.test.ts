import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserPrincipal } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import type { AppConfig } from "../../../infrastructure/config/app-config";
import type {
  RateLimitRule,
  RateLimitService,
} from "../../../infrastructure/rate-limit/rate-limit.service";
import {
  registrableDomain,
  SignupGuard,
  signupBuckets,
  type SignupLimitConfig,
} from "./signup-guard";

const env: SignupLimitConfig = {
  QUICK_START_DAILY_CAP: 500,
  QUICK_START_DOMAIN_DAILY_LIMIT: 20,
  QUICK_START_IP_DAILY_LIMIT: 40,
  QUICK_START_SOURCE_SHARE_PCT: 25,
};

describe("registrableDomain (eTLD+1)", () => {
  it.each([
    ["a.evil.com", "evil.com"],
    ["b.c.evil.com", "evil.com"],
    ["EVIL.com.", "evil.com"],
    ["shop.com.vn", "shop.com.vn"],
    ["mail.shop.com.vn", "shop.com.vn"],
    ["x.vn", "x.vn"],
    ["a.b.x.vn", "x.vn"],
    ["school.edu.vn", "school.edu.vn"],
    ["mail.yahoo.com.vn", "yahoo.com.vn"],
    // Private-section suffixes are not honoured: one bucket for the whole zone.
    ["a.duckdns.org", "duckdns.org"],
    ["b.duckdns.org", "duckdns.org"],
    // No registrable domain: the host itself.
    ["com.vn", "com.vn"],
  ])("%s → %s", (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });
});

describe("signupBuckets", () => {
  const byName = (email: string, ipPrefix: string | null = "10.0.0.0/24") =>
    Object.fromEntries(
      signupBuckets(env, { userId: "u1", email, ipPrefix }).map((b) => [b.rule.name, b]),
    );

  it("keys the domain bucket on the registrable domain, global last", () => {
    const buckets = signupBuckets(env, {
      userId: "u1",
      email: "x@a.evil.com",
      ipPrefix: "10.0.0.0/24",
    });
    expect(buckets.map((b) => b.rule.name)).toEqual([
      "salons.quick_start.user",
      "salons.quick_start.ip",
      "salons.quick_start.ip_daily",
      "salons.quick_start.domain",
      "salons.quick_start.global",
    ]);
    expect(buckets[3]?.subject).toBe("evil.com");
    expect(byName("y@b.evil.com")["salons.quick_start.domain"]?.subject).toBe("evil.com");
  });

  it("every source sub-cap stays below the global cap (major providers get the share only)", () => {
    const share = 125; // 25 % of 500
    expect(byName("x@gmail.com")["salons.quick_start.domain"]?.rule.limit).toBe(share);
    expect(byName("x@shop.com.vn")["salons.quick_start.domain"]?.rule.limit).toBe(20);
    expect(byName("x@shop.com.vn")["salons.quick_start.ip_daily"]?.rule.limit).toBe(40);
    const tight = signupBuckets(
      { ...env, QUICK_START_DAILY_CAP: 8, QUICK_START_DOMAIN_DAILY_LIMIT: 1000 },
      { userId: "u1", email: "x@shop.com.vn", ipPrefix: "10.0.0.0/24" },
    );
    for (const b of tight.filter((t) => t.subject !== "all")) {
      expect(b.rule.limit).toBeLessThan(8);
    }
  });

  it("never one shared IP bucket when the IP is unknown", () => {
    expect(byName("x@shop.vn", null)["salons.quick_start.ip"]?.subject).toBe("user:u1");
  });
});

describe("SignupGuard", () => {
  afterEach(() => vi.restoreAllMocks());

  /** In-memory stand-in for the Valkey fixed windows (the integration suite uses the real one). */
  const fakeLimits = () => {
    const counts = new Map<string, number>();
    const key = (r: RateLimitRule, s: string) => `${r.name}:${s}`;
    const service = {
      consume: vi.fn((rule: RateLimitRule, subject: string) => {
        const n = (counts.get(key(rule, subject)) ?? 0) + 1;
        counts.set(key(rule, subject), n);
        if (n > rule.limit) return Promise.reject(new AppError(429, "common.rate_limited", "x"));
        return Promise.resolve(n);
      }),
      refund: vi.fn((rule: RateLimitRule, subject: string) => {
        const n = counts.get(key(rule, subject)) ?? 0;
        if (n > 0) counts.set(key(rule, subject), n - 1);
        return Promise.resolve();
      }),
    };
    return { counts, service };
  };
  const guardWith = (cfg: SignupLimitConfig) => {
    const limits = fakeLimits();
    const guard = new SignupGuard(
      { env: cfg } as unknown as AppConfig,
      limits.service as unknown as RateLimitService,
    );
    return { guard, ...limits };
  };
  const meta = (ipPrefix: string) => ({ ipPrefix, userAgent: null });

  it("refuses platform admins", () => {
    const { guard } = guardWith(env);
    expect(() => {
      guard.assertPrincipal({ userId: "u", platformRole: "support_admin" } as UserPrincipal);
    }).toThrow(AppError);
    expect(() => {
      guard.assertPrincipal({ userId: "u", platformRole: null } as UserPrincipal);
    }).not.toThrow();
  });

  it("a refused attempt gives back every hit it counted (global untouched)", async () => {
    const { guard, counts } = guardWith({ ...env, QUICK_START_DOMAIN_DAILY_LIMIT: 1 });
    await guard.consume("u1", "a@x.evil.com", meta("10.0.1.0/24"));
    await expect(guard.consume("u2", "b@y.evil.com", meta("10.0.2.0/24"))).rejects.toThrow(
      AppError,
    );
    expect(counts.get("salons.quick_start.global:all")).toBe(1);
    expect(counts.get("salons.quick_start.user:u2")).toBe(0);
    expect(counts.get("salons.quick_start.domain:evil.com")).toBe(1);
  });

  it("logs an error when the global cap is near and when it is reached", async () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { guard } = guardWith({
      ...env,
      QUICK_START_DAILY_CAP: 5,
      QUICK_START_SOURCE_SHARE_PCT: 100,
    });
    for (let i = 1; i <= 3; i++) {
      await guard.consume(`u${String(i)}`, `a@d${String(i)}.vn`, meta(`10.0.${String(i)}.0/24`));
    }
    expect(error).not.toHaveBeenCalled();
    await guard.consume("u4", "a@d4.vn", meta("10.0.4.0/24")); // 4 = ceil(5 × 0.8)
    expect(error).toHaveBeenCalledWith(
      { cap: 5, count: 4 },
      "quick-start global daily cap nearly reached",
    );
    await guard.consume("u5", "a@d5.vn", meta("10.0.5.0/24"));
    await expect(guard.consume("u6", "a@d6.vn", meta("10.0.6.0/24"))).rejects.toThrow(AppError);
    expect(error).toHaveBeenLastCalledWith({ cap: 5 }, "quick-start global daily cap reached");
  });
});
