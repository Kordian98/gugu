#!/usr/bin/env node
// `pnpm db:drift` (ADR-0008). Prisma's diff never drops raw SQL objects, but it is also blind to
// them: a missing EXCLUDE constraint is not reported. So this runs two checks:
//   1. `prisma migrate diff` migrations → schema must be empty (schema.prisma and SQL agree);
//   2. every object in prisma/raw-objects.json must exist in the target database.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

try {
  process.loadEnvFile("../../.env");
} catch {
  // fall back to the shell environment
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
if (!process.env.SHADOW_DATABASE_URL) {
  process.env.SHADOW_DATABASE_URL = Object.assign(new URL(url), {
    pathname: "/gugu_shadow",
  }).toString();
}

let failed = false;
try {
  execFileSync(
    "prisma",
    [
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  console.log("db:drift prisma: migrations and schema.prisma agree");
} catch (e) {
  failed = true;
  console.error(
    e.status === 2
      ? "db:drift prisma: drift detected — schema.prisma and migrations differ; create a migration"
      : `db:drift prisma: could not run prisma migrate diff (${e.message})`,
  );
}

const expected = JSON.parse(readFileSync("prisma/raw-objects.json", "utf8"));
const client = new pg.Client({ connectionString: url });
await client.connect();
const present = async (sql) => new Set((await client.query(sql)).rows.map((r) => r.name));
const extensions = await present("SELECT extname AS name FROM pg_extension");
const constraints = await present("SELECT conname AS name FROM pg_constraint");
const indexes = await present("SELECT indexname AS name FROM pg_indexes");
await client.end();
for (const [kind, names, have] of [
  ["extension", expected.extensions, extensions],
  ["constraint", expected.constraints, constraints],
  ["index", expected.indexes, indexes],
]) {
  for (const name of names) {
    if (!have.has(name)) {
      failed = true;
      console.error(`db:drift raw: missing ${kind} "${name}" in ${new URL(url).pathname.slice(1)}`);
    }
  }
}
if (failed) process.exit(1);
console.log("db:drift raw: all objects in prisma/raw-objects.json exist");
