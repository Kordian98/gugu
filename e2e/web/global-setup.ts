// Runs once after the stack is up (Playwright starts `webServer` first): wipes E2E mail, seeds one
// salon per project through the API, grants super_admin to each project's admin email with the
// repo's own script, and writes the seed manifest the tests read (.e2e/seed.json).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATABASE_URL } from "./support/env";
import { clearE2eMail } from "./support/mailpit";
import { PROJECTS, seedSalon } from "./support/seed";

export const SEED_FILE = resolve(import.meta.dirname, ".e2e/seed.json");

export default async function globalSetup(): Promise<void> {
  await clearE2eMail();
  const salons = await Promise.all(PROJECTS.map((p) => seedSalon(p)));
  const apiDir = resolve(import.meta.dirname, "../../apps/api");
  for (const s of salons) {
    execFileSync("node", ["scripts/seed-platform-admin.mjs", "--email", s.adminEmail], {
      cwd: apiDir,
      env: { PATH: process.env["PATH"], NODE_ENV: "development", DATABASE_URL },
      stdio: "inherit",
    });
  }
  mkdirSync(resolve(import.meta.dirname, ".e2e"), { recursive: true });
  writeFileSync(
    SEED_FILE,
    JSON.stringify(Object.fromEntries(salons.map((s) => [s.project, s])), null, 2),
  );
}
