import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { forceTestEnvironment } from "./test-env";

/** Brings the *_test database to the current migrations before the integration suites run. */
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
  const { databaseUrl } = forceTestEnvironment();
  execFileSync(resolve("node_modules/.bin/prisma"), ["migrate", "deploy"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
