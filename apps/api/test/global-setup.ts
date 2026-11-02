import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Runs after the config's test-DB guard (main). Brings the *_test database to the current migrations before the integration suites run. */
export default function setup(): void {
  try {
    run();
  } catch (e) {
    // Vitest cannot print some startup errors; make the reason visible.
    console.error("integration global setup failed:", e instanceof Error ? e.message : e);
    throw e;
  }
}

function run(): void {
  // vitest.integration.config.ts has already pointed DATABASE_URL at TEST_DATABASE_URL (*_test).
  const databaseUrl = process.env["TEST_DATABASE_URL"];
  if (!databaseUrl || process.env["DATABASE_URL"] !== databaseUrl)
    throw new Error("integration tests must run on TEST_DATABASE_URL");
  execFileSync(resolve("node_modules/.bin/prisma"), ["migrate", "deploy"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
