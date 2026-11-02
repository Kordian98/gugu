import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Integration tests need the local stack (`pnpm stack:up`) and read the root .env.
try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the shell environment.
}

// Never touch the dev database or the dev worker's Redis: integration tests run against
// TEST_DATABASE_URL and a separate Redis DB. Tests that expired real trials and leaked
// emulator faults into the dev worker are why this guard exists.
const testDb = process.env["TEST_DATABASE_URL"];
if (!testDb) throw new Error("TEST_DATABASE_URL must be set for integration tests");
if (!/_test(\?|$)/.test(new URL(testDb).pathname + (new URL(testDb).search || ""))) {
  throw new Error(
    `TEST_DATABASE_URL must point at a *_test database, got ${new URL(testDb).pathname}`,
  );
}
process.env["DATABASE_URL"] = testDb;
const redis = new URL(process.env["REDIS_URL"] ?? "redis://127.0.0.1:16379");
redis.pathname = `/${process.env["TEST_REDIS_DB"] ?? "15"}`;
process.env["REDIS_URL"] = redis.toString();

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.int.test.ts", "test/**/*.int.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
