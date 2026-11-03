#!/usr/bin/env node
// Boots Expo web for E2E on its own port, pointed at the E2E API. Playwright `webServer`.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { E2E, apiUrl, assertIsolated } from "./config.mjs";

assertIsolated();
const appDir = resolve(import.meta.dirname, "../../../apps/app");
const child = spawn("pnpm", ["exec", "expo", "start", "--web", "--port", String(E2E.webPort)], {
  cwd: appDir,
  stdio: "inherit",
  env: {
    ...process.env,
    CI: "1",
    BROWSER: "none",
    EXPO_NO_TELEMETRY: "1",
    EXPO_PUBLIC_API_URL: apiUrl,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
