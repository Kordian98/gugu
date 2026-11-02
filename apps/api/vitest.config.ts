import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC (not esbuild) so Nest's decorator metadata is emitted in tests.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "evals/**/*.test.ts"],
    exclude: ["**/*.int.test.ts", "**/node_modules/**"],
    environment: "node",
  },
});
