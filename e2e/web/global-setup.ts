// Runs once after the stack is up (Playwright starts `webServer` first): wipes E2E mail, seeds one
// salon per project × area through the API, grants super_admin to each project's admin email with
// the repo's own script, and writes the manifest the tests read (.e2e/seed.json).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATABASE_URL } from "./support/env";
import { clearE2eMail } from "./support/mailpit";
import {
  AREAS,
  PROJECTS,
  mail,
  moveToFreeBasic,
  seedSalon,
  type SeedManifest,
} from "./support/seed";

export default async function globalSetup(): Promise<void> {
  await clearE2eMail();
  const apiDir = resolve(import.meta.dirname, "../../apps/api");
  const manifest: SeedManifest = {};
  await Promise.all(
    PROJECTS.map(async (project) => {
      const salons = await Promise.all(AREAS.map((area) => seedSalon(project, area)));
      const adminEmail = mail("admin", project);
      manifest[project] = Object.assign(
        Object.fromEntries(salons.map((s) => [s.area, s])) as unknown as SeedManifest[string],
        { adminEmail },
      );
    }),
  );
  // seed-platform-admin.mjs refuses anything but NODE_ENV=development and a gugu_<suffix> DB.
  // --with-totp enrols a TOTP factor (admin writes need two-step verification + step-up) and
  // prints its base32 secret once; codes come from scripts/totp-code.mjs (support/totp.ts).
  const grantAdmin = (email: string): string => {
    const out = execFileSync(
      "node",
      ["scripts/seed-platform-admin.mjs", "--email", email, "--with-totp"],
      {
        cwd: apiDir,
        env: { PATH: process.env["PATH"], NODE_ENV: "development", DATABASE_URL },
        encoding: "utf8",
      },
    );
    const secret = /Secret \(shown once\): ([A-Z2-7]+)/.exec(out)?.[1];
    if (!secret) throw new Error(`seed-platform-admin printed no TOTP secret:\n${out}`);
    return secret;
  };
  for (const project of PROJECTS) {
    const entry = manifest[project];
    if (!entry) throw new Error(`seed missing for ${project}`);
    entry.adminTotpSecret = grantAdmin(entry.adminEmail);
    // X25: the `basic` area salon leaves its trial for the free Basic year. A separate setup admin
    // keeps the test admin's magic-link budget and TOTP steps untouched.
    const setupAdmin = mail("admin-setup", project);
    await moveToFreeBasic(setupAdmin, grantAdmin(setupAdmin), entry.basic.salonId);
  }
  mkdirSync(resolve(import.meta.dirname, ".e2e"), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, ".e2e/seed.json"), JSON.stringify(manifest, null, 2));
}
