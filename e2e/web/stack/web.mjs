#!/usr/bin/env node
// Boots Expo web for E2E on its own port, pointed at the E2E API (Playwright `webServer`).
// Default: production export (`expo export --platform web`) served by `expo serve` — every route is
// prebuilt, so no lazy Metro bundling during tests (fast, deterministic) and it is what ships.
// E2E_WEB_MODE=dev runs the Metro dev server instead (slower first loads; for debugging).
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { E2E, apiUrl, assertIsolated } from "./config.mjs";

assertIsolated();
const appDir = resolve(import.meta.dirname, "../../../apps/app");
const outDir = resolve(import.meta.dirname, "../.e2e/dist-web");
const env = {
  ...process.env,
  CI: "1",
  BROWSER: "none",
  EXPO_NO_TELEMETRY: "1",
  EXPO_PUBLIC_API_URL: apiUrl,
};

let child;
if (process.env.E2E_WEB_MODE === "dev") {
  child = spawn("pnpm", ["exec", "expo", "start", "--web", "--port", String(E2E.webPort)], {
    cwd: appDir,
    stdio: "inherit",
    env,
  });
} else {
  execFileSync("pnpm", ["exec", "expo", "export", "--platform", "web", "--output-dir", outDir], {
    cwd: appDir,
    stdio: ["ignore", "ignore", "inherit"],
    env,
  });
  // The server bundle is CommonJS; e2e/web is "type": "module", so mark the export directory.
  writeFileSync(resolve(outDir, "package.json"), '{ "private": true, "type": "commonjs" }\n');
  child = spawn("pnpm", ["exec", "expo", "serve", outDir, "--port", String(E2E.webPort)], {
    cwd: appDir,
    stdio: "inherit",
    env,
  });
}
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
