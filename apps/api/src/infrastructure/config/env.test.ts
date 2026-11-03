import { describe, expect, it } from "vitest";
import { InvalidEnvError, parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:15432/gugu",
  REDIS_URL: "redis://127.0.0.1:16379",
};

describe("parseEnv", () => {
  it("applies defaults (port 3001, development)", () => {
    expect(parseEnv(base)).toMatchObject({
      API_PORT: 3001,
      NODE_ENV: "development",
      DATABASE_POOL_MAX: 10,
    });
  });

  it("AUDIT_RETENTION_MONTHS defaults to 24 and refuses less than 12 (q94)", () => {
    expect(parseEnv(base).AUDIT_RETENTION_MONTHS).toBe(24);
    expect(parseEnv({ ...base, AUDIT_RETENTION_MONTHS: "36" }).AUDIT_RETENTION_MONTHS).toBe(36);
    expect(() => parseEnv({ ...base, AUDIT_RETENTION_MONTHS: "11" })).toThrow(
      /AUDIT_RETENTION_MONTHS/,
    );
  });

  it("coerces numeric strings", () => {
    expect(parseEnv({ ...base, API_PORT: "3002" }).API_PORT).toBe(3002);
  });

  it("rejects missing or non-postgres DATABASE_URL without echoing values", () => {
    expect(() => parseEnv({ REDIS_URL: base.REDIS_URL })).toThrow(InvalidEnvError);
    try {
      parseEnv({ ...base, DATABASE_URL: "mysql://u:hunter2@db/x" });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain("DATABASE_URL");
      expect((e as Error).message).not.toContain("hunter2");
    }
  });

  it("refuses the built-in AUTH_SECRET in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/AUTH_SECRET/);
    expect(
      parseEnv({
        ...base,
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(40),
        BOOKING_TOKEN_SECRET: "y".repeat(40),
        SUPPORT_EMAIL: "support@example.com",
        MFA_ENCRYPTION_KEY: "m".repeat(40),
        ANALYTICS_HASH_SECRET: "a".repeat(40),
      }).AUTH_SECRET,
    ).toHaveLength(40);
  });

  it("refuses the built-in BOOKING_TOKEN_SECRET in production (topic 06)", () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", AUTH_SECRET: "x".repeat(40) }),
    ).toThrow(/BOOKING_TOKEN_SECRET/);
  });

  it("refuses the dev SUPPORT_EMAIL in production (q89 banner)", () => {
    const prod = {
      ...base,
      NODE_ENV: "production",
      AUTH_SECRET: "x".repeat(40),
      BOOKING_TOKEN_SECRET: "y".repeat(40),
      MFA_ENCRYPTION_KEY: "m".repeat(40),
      ANALYTICS_HASH_SECRET: "a".repeat(40),
    };
    expect(() => parseEnv(prod)).toThrow(/SUPPORT_EMAIL/);
    expect(parseEnv({ ...prod, SUPPORT_EMAIL: "help@example.com" }).SUPPORT_EMAIL).toBe(
      "help@example.com",
    );
  });

  it("refuses the built-in ANALYTICS_HASH_SECRET in production (ADR-0018)", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://u:p@db:5432/gugu",
        REDIS_URL: "redis://cache:6379",
        AUTH_SECRET: "x".repeat(40),
        BOOKING_TOKEN_SECRET: "y".repeat(40),
        MFA_ENCRYPTION_KEY: "m".repeat(40),
        SUPPORT_EMAIL: "help@example.com",
      }),
    ).toThrow(/ANALYTICS_HASH_SECRET/);
  });

  it("refuses the built-in MFA_ENCRYPTION_KEY in production (topic 05 step 9)", () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(40),
        BOOKING_TOKEN_SECRET: "y".repeat(40),
        SUPPORT_EMAIL: "help@example.com",
      }),
    ).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it("Zalo: emulator by default outside production, disabled in production, http needs keys", () => {
    expect(parseEnv(base).ZALO_CLIENT).toBe("emulated");
    const prod = {
      ...base,
      NODE_ENV: "production",
      AUTH_SECRET: "x".repeat(40),
      BOOKING_TOKEN_SECRET: "y".repeat(40),
      SUPPORT_EMAIL: "support@example.com",
      MFA_ENCRYPTION_KEY: "m".repeat(40),
      ANALYTICS_HASH_SECRET: "a".repeat(40),
    };
    expect(parseEnv(prod).ZALO_CLIENT).toBe("disabled");
    expect(() => parseEnv({ ...prod, ZALO_CLIENT: "emulated" })).toThrow(/ZALO_CLIENT/);
    expect(() => parseEnv({ ...base, ZALO_CLIENT: "http" })).toThrow(/ZALO_CLIENT/);
    expect(
      parseEnv({
        ...base,
        ZALO_CLIENT: "http",
        ZALO_APP_ID: "123",
        ZALO_APP_SECRET: "s",
        ZALO_OA_SECRET_KEY: "k".repeat(20),
        ZALO_TOKEN_KEY: "t".repeat(40),
      }).ZALO_CLIENT,
    ).toBe("http");
  });

  it("multi-service: on by default in every environment (q91), false switches it off", () => {
    const prod = {
      ...base,
      NODE_ENV: "production",
      AUTH_SECRET: "x".repeat(40),
      BOOKING_TOKEN_SECRET: "y".repeat(40),
      SUPPORT_EMAIL: "support@example.com",
      MFA_ENCRYPTION_KEY: "m".repeat(40),
      ANALYTICS_HASH_SECRET: "a".repeat(40),
    };
    expect(parseEnv(base).BOOKING_MULTI_SERVICE).toBe(true);
    expect(parseEnv(prod).BOOKING_MULTI_SERVICE).toBe(true);
    expect(parseEnv({ ...prod, BOOKING_MULTI_SERVICE: "false" }).BOOKING_MULTI_SERVICE).toBe(false);
    expect(parseEnv({ ...base, BOOKING_MULTI_SERVICE: "true" }).BOOKING_MULTI_SERVICE).toBe(true);
    expect(() => parseEnv({ ...base, BOOKING_MULTI_SERVICE: "yes" })).toThrow(
      /BOOKING_MULTI_SERVICE/,
    );
  });

  it("parses TRUST_PROXY: off by default, hop counts and address lists, never true", () => {
    expect(parseEnv(base).TRUST_PROXY).toBe(false);
    expect(parseEnv({ ...base, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(parseEnv({ ...base, TRUST_PROXY: "loopback, 10.0.0.0/8" }).TRUST_PROXY).toBe(
      "loopback, 10.0.0.0/8",
    );
    expect(() => parseEnv({ ...base, TRUST_PROXY: "true" })).toThrow(/TRUST_PROXY/);
  });
});
