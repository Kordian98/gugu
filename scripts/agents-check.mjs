#!/usr/bin/env node
// `pnpm agents:check` — keeps agents, skills, docs and code in sync (01 §3.8).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];
const warnings = [];
const read = (p) => readFileSync(join(root, p), "utf8");
const dirs = (p) =>
  existsSync(join(root, p))
    ? readdirSync(join(root, p)).filter((d) => statSync(join(root, p, d)).isDirectory())
    : [];

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split("\n")
      .map((l) => /^([a-zA-Z_-]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((x) => [x[1], x[2].trim()]),
  );
}

// 1. Agents: valid frontmatter, name matches file.
const agentDir = ".claude/agents";
const agents = readdirSync(join(root, agentDir)).filter((f) => f.endsWith(".md"));
const agentNames = new Set(agents.map((f) => f.replace(/\.md$/, "")));
for (const f of agents) {
  const fm = frontmatter(read(`${agentDir}/${f}`));
  if (!fm) errors.push(`${agentDir}/${f}: missing frontmatter`);
  else {
    if (fm.name !== f.replace(/\.md$/, ""))
      errors.push(`${agentDir}/${f}: name "${fm.name}" ≠ file name`);
    if (!fm.description) errors.push(`${agentDir}/${f}: missing description`);
  }
}

// 2. Skills: valid frontmatter; every skill referenced by an agent exists.
const skills = new Set(dirs(".claude/skills"));
for (const s of skills) {
  const p = `.claude/skills/${s}/SKILL.md`;
  if (!existsSync(join(root, p))) {
    errors.push(`${p}: missing`);
    continue;
  }
  const fm = frontmatter(read(p));
  if (!fm || fm.name !== s) errors.push(`${p}: frontmatter name must be "${s}"`);
  if (!fm?.description) errors.push(`${p}: missing description`);
}
for (const f of agents) {
  for (const m of read(`${agentDir}/${f}`).matchAll(/\.claude\/skills\/([a-z0-9-]+)/g)) {
    if (!skills.has(m[1])) errors.push(`${agentDir}/${f}: references missing skill "${m[1]}"`);
  }
}

// 3. Ownership: owners exist; every package and API module has an owner row.
const ownershipPath = ".claude/skills/architecture/references/ownership.md";
const ownership = read(ownershipPath);
for (const row of ownership
  .split("\n")
  .filter((l) => l.startsWith("| ") && !l.startsWith("| Path"))) {
  const cells = row.split("|").map((c) => c.trim());
  const owner = cells[2]?.replace(/\*\(planned\)\*/, "").trim();
  if (!owner || owner.startsWith("---") || owner.includes(" ")) continue;
  if (!agentNames.has(owner)) errors.push(`${ownershipPath}: owner "${owner}" has no agent file`);
}
for (const pkg of dirs("packages")) {
  if (!ownership.includes(`packages/${pkg}`))
    errors.push(`packages/${pkg}: no owner in ${ownershipPath}`);
}
for (const mod of dirs("apps/api/src/modules")) {
  const re = new RegExp(`modules/(\\{[^}]*\\b${mod}\\b[^}]*\\}|${mod})/`);
  if (!re.test(ownership)) errors.push(`apps/api/src/modules/${mod}: no owner in ${ownershipPath}`);
}

// 4. docs/llms.txt: relative links resolve.
const llms = "docs/llms.txt";
for (const m of read(llms).matchAll(/\]\(([^)]+)\)/g)) {
  const target = m[1];
  if (/^https?:/.test(target)) continue;
  if (!existsSync(resolve(root, dirname(llms), target)))
    errors.push(`${llms}: broken link ${target}`);
}

// 5. Domain docs have a Status section.
for (const f of existsSync(join(root, "docs/domains"))
  ? readdirSync(join(root, "docs/domains"))
  : []) {
  if (f.endsWith(".md") && !/(^#+ .*Status|\*\*Status:\*\*)/im.test(read(`docs/domains/${f}`)))
    warnings.push(`docs/domains/${f}: no "## Status" section`);
}

for (const w of warnings) console.warn(`agents:check warning: ${w}`);
if (errors.length) {
  console.error(errors.map((e) => `agents:check error: ${e}`).join("\n"));
  process.exit(1);
}
console.log(`agents:check ok — ${agents.length} agents, ${skills.size} skills`);
