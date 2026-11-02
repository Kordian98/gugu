import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Assistant evals (topic 08 A3): need the local stack. With ANTHROPIC_API_KEY they call the real
// model (costs money); without it they run the echo-adversary PII/security suite.
try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the shell environment.
}

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 900_000,
    hookTimeout: 120_000,
  },
});
