import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Integration tests need the local stack (`pnpm stack:up`) and read the root .env.
try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the shell environment.
}

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
