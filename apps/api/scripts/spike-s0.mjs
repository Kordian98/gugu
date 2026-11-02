#!/usr/bin/env node
// Spike 04-S0 runner (ADR-0008). Recreates the gugu_spike databases on the local stack, applies the
// spike migration, checks that `prisma migrate diff` sees no drift (i.e. would not drop the raw SQL
// objects), then runs the spike integration tests. Needs `pnpm stack:up`.
import { execFileSync } from "node:child_process";
import pg from "pg";

try {
  process.loadEnvFile("../../.env");
} catch {
  // fall back to the shell environment
}
const admin = process.env.DATABASE_URL;
if (!admin) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
const base = new URL(admin);
const urlFor = (db) => Object.assign(new URL(base), { pathname: `/${db}` }).toString();
const env = {
  ...process.env,
  SPIKE_DATABASE_URL: urlFor("gugu_spike"),
  SPIKE_SHADOW_DATABASE_URL: urlFor("gugu_spike_shadow"),
};

const client = new pg.Client({ connectionString: admin });
await client.connect();
for (const db of ["gugu_spike", "gugu_spike_shadow"]) {
  await client.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${db}`);
}
await client.end();

const prisma = (...args) =>
  execFileSync("prisma", [...args, "--config", "prisma/spike/prisma.config.ts"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
const diffExit = (from) => {
  try {
    prisma("migrate", "diff", ...from, "--to-schema", "prisma/spike/schema.prisma", "--exit-code");
    return 0;
  } catch (e) {
    return e.status;
  }
};

prisma("migrate", "deploy");
const fromMigrations = diffExit(["--from-migrations", "prisma/spike/migrations"]);
const fromDatabase = diffExit(["--from-config-datasource"]);
console.log(
  `migrate diff migrations→schema exit=${fromMigrations}, database→schema exit=${fromDatabase}`,
);
if (fromMigrations !== 0 || fromDatabase !== 0) {
  console.error("spike: Prisma reports drift — raw SQL objects would be dropped/altered");
  process.exit(1);
}
prisma("generate");
execFileSync("vitest", ["run", "--config", "vitest.integration.config.ts", "test/spike"], {
  env,
  stdio: "inherit",
});
