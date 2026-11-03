// GuGu web E2E (topic 13 R41). `pnpm e2e:web` boots its own stack: API + worker on :3460 against
// the `gugu_e2e` database and Redis DB 14, Expo web on :8460. See README.md.
import { defineConfig, devices } from "@playwright/test";
import { apiUrl, webUrl } from "./stack/config.mjs";

// Local iteration only: E2E_REUSE_WEB=1 keeps an already running web server on :8460 (skips the
// ~30 s export). The backend always restarts so every run starts from a fresh database.
const reuseWeb = process.env["E2E_REUSE_WEB"] === "1";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../../reports/e2e-web/artifacts",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: Number(process.env["E2E_WORKERS"] ?? 2),
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["junit", { outputFile: "../../reports/e2e-web/junit.xml" }],
    ["html", { outputFolder: "../../reports/e2e-web/html", open: "never" }],
    ["./support/status-reporter.ts"],
  ],
  use: {
    baseURL: webUrl,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "node stack/backend.mjs",
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: "node stack/web.mjs",
      url: `${webUrl}/vi`,
      reuseExistingServer: reuseWeb,
      timeout: 300_000,
      stdout: "ignore",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
