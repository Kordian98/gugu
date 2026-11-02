#!/usr/bin/env node
// `pnpm dev:api`: rebuild on change (rolldown --watch) and restart the API (node --watch).
// Set DEV_WORKER=1 to also run the BullMQ worker.
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
if (process.env.DEV_WORKER === "1") {
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
