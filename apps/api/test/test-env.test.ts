import { describe, expect, it } from "vitest";
import { forceTestEnvironment } from "./test-env";

describe("forceTestEnvironment", () => {
  const base = { DATABASE_URL: "postgresql://u:p@h:1/gugu", REDIS_URL: "redis://h:2/0" };
  it("switches to the *_test database and a separate redis db", () => {
    const env = { ...base, TEST_DATABASE_URL: "postgresql://u:p@h:1/gugu_test" };
    forceTestEnvironment(env);
    expect(env.DATABASE_URL).toBe("postgresql://u:p@h:1/gugu_test");
    expect(env.REDIS_URL).toBe("redis://h:2/15");
  });
  it("refuses the dev database or a missing test database", () => {
    expect(() => forceTestEnvironment({ ...base })).toThrow(/TEST_DATABASE_URL/);
    expect(() =>
      forceTestEnvironment({ ...base, TEST_DATABASE_URL: "postgresql://u:p@h:1/gugu" }),
    ).toThrow(/_test/);
  });
});
