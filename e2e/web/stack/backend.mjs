#!/usr/bin/env node
// Boots the E2E backend (Playwright `webServer`): fresh `gugu_e2e` database, flushed Redis DB,
// migrations, API build, then the API and the BullMQ worker as children. Ctrl-C / SIGTERM from
// Playwright stops both. Needs the shared Compose services (`pnpm stack:up`): Postgres, Valkey,
// Mailpit. Nothing here reads the dev .env.
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
import { Redis } from "ioredis";
import { E2E, assertIsolated, backendEnv, databaseUrl, redisUrl } from "./config.mjs";

assertIsolated();
const apiDir = resolve(import.meta.dirname, "../../../apps/api");
const log = (msg) => process.stdout.write(`[e2e-backend] ${msg}\n`);

// 1. Fresh database.
const admin = new pg.Client({ ...E2E.pg, database: "postgres" });
await admin.connect().catch((e) => {
  throw new Error(
    `Postgres not reachable on ${String(E2E.pg.port)} — run \`pnpm stack:up\` (${e.message})`,
  );
});
await admin.query(`DROP DATABASE IF EXISTS ${E2E.pg.database} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${E2E.pg.database}`);
await admin.end();
log(`database ${E2E.pg.database} recreated`);

// 2. Flush the dedicated Redis DB (rate limits, queues, Zalo emulator state).
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
await redis.connect();
await redis.flushdb();
redis.disconnect();
log(`redis db ${String(E2E.redisDb)} flushed`);

// 3. Migrations + build (same bundle the dev server runs).
const env = backendEnv();
const sh = (cmd, args, extra = {}) =>
  execFileSync(cmd, args, { cwd: apiDir, env: { ...env, ...extra }, stdio: "inherit" });
// `migrate deploy` never touches the shadow DB, but prisma.config.ts requires a distinct URL.
sh("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  SHADOW_DATABASE_URL: databaseUrl.replace(/\/gugu_e2e$/, "/gugu_e2e_shadow"),
});
if (process.env.E2E_SKIP_BUILD !== "1") {
  sh("pnpm", ["run", "generate"]);
  sh("pnpm", ["run", "build"]);
}

// 4. API + worker.
const children = ["dist/worker.js", "dist/main.js"].map((entry) =>
  spawn("node", ["--enable-source-maps", entry], { cwd: apiDir, env, stdio: "inherit" }),
);
let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 3000).unref();
};
for (const c of children) {
  c.on("exit", (code) => {
    if (!stopping) {
      log(`child exited with ${String(code)}; stopping the stack`);
      stop(1);
    }
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
