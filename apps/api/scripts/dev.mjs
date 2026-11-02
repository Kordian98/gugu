#!/usr/bin/env node
// `pnpm dev:api`: rebuild on change (rolldown --watch) and restart the API and the BullMQ worker
// (node --watch-path=dist) whenever the bundle changes, so neither runs stale code.
// DEV_WORKER=0 skips the worker (e.g. when it runs elsewhere); `pnpm dev:worker` runs it alone.
import { execFileSync, spawn } from "node:child_process";

execFileSync("pnpm", ["run", "generate"], { stdio: "inherit" });
execFileSync("rolldown", ["-c", "rolldown.config.ts"], { stdio: "inherit" });

const run = (cmd, args) => spawn(cmd, args, { stdio: "inherit" });
const children = [
  run("rolldown", ["-c", "rolldown.config.ts", "--watch"]),
  run("node", [
    "--enable-source-maps",
    "--env-file-if-exists=../../.env",
    "--watch-path=dist",
    "dist/main.js",
  ]),
];
if (process.env.DEV_WORKER !== "0") {
  children.push(
    run("node", [
      "--enable-source-maps",
      "--env-file-if-exists=../../.env",
      "--watch-path=dist",
      "dist/worker.js",
    ]),
  );
}
const stop = () => {
  for (const c of children) c.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children) c.on("exit", (code) => code && code !== 0 && process.exit(code));
