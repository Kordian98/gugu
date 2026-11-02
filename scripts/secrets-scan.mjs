#!/usr/bin/env node
// Secret scan gate for `pnpm verify` (01 §3.6). Uses gitleaks when installed; otherwise runs a
// built-in pattern scan over tracked + staged files and says so loudly (never silently skips).
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const hasGitleaks = spawnSync("gitleaks", ["version"], { stdio: "ignore" }).status === 0;
if (hasGitleaks) {
  const r = spawnSync("gitleaks", ["dir", ".", "--no-banner", "--redact", "-c", ".gitleaks.toml"], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

console.warn(
  "secrets: gitleaks not installed — running built-in fallback scan (install: brew install gitleaks)",
);
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(
    (f) =>
      f &&
      !/(^|\/)(pnpm-lock\.yaml|.*\.(png|jpe?g|webp|gif|ico|glb|ktx2|mp4|webm|woff2?|ttf))$/i.test(
        f,
      ),
  );

const patterns = [
  ["AWS access key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["Private key", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9]{32,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["Slack token", /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
  ["Generic assignment", /\b(secret|password|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{16,}["']/i],
];

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // deleted in working tree
  }
  text.split("\n").forEach((line, i) => {
    if (line.includes("gitleaks:allow")) return;
    for (const [name, re] of patterns)
      if (re.test(line)) findings.push(`${file}:${i + 1} — ${name}`);
  });
}

if (findings.length) {
  console.error("secrets: possible secrets found:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`secrets: fallback scan clean (${files.length} files)`);
