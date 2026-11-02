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
      }).AUTH_SECRET,
    ).toHaveLength(40);
  });

  it("refuses the built-in BOOKING_TOKEN_SECRET in production (topic 06)", () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", AUTH_SECRET: "x".repeat(40) }),
    ).toThrow(/BOOKING_TOKEN_SECRET/);
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
