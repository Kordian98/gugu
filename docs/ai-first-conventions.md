# AI-first conventions

GuGu is built AI-first: most implementation work is done by AI coding agents, and the product itself ships an AI business agent. Every domain therefore ships three things alongside its code: a **subagent**, a **skill**, and **agent-friendly docs**. This file is the contract all of them follow.

## Per-domain deliverables

| Artifact | Path | Purpose |
|---|---|---|
| Task spec | `docs/tasks/NN-<slug>.md` | What to build, gaps resolved, acceptance criteria |
| Domain doc | `docs/domains/<slug>.md` | Durable reference: model, invariants, flows, file map (filled in as code lands) |
| Subagent | `.claude/agents/<slug>.md` | Domain specialist an orchestrator can delegate to |
| Skill | `.claude/skills/<slug>/SKILL.md` | Procedures, invariants, checklists loaded on demand |
| Tracker entries | GuGu Roadmap artifact (`roadmap-tracker` skill) | Milestone status, questions, activity log |
| Product-agent tools | section in the spec + later `packages/agent-tools` | Which domain operations the in-product AI agent / MCP server may call |

## Subagent format (`.claude/agents/<slug>.md`)

```markdown
---
name: <slug>
description: <When to delegate to this agent — concrete triggers, file paths, domain terms. One to three sentences.>
tools: Read, Grep, Glob, Edit, Write, Bash   # least privilege; reviewers get read-only
model: inherit
---

<System prompt: role, owned paths, invariants it must never break, docs/skills to load first,
definition of done (tests, docs update), what to hand back to the orchestrator.>
```

Rules: one agent per domain plus cross-cutting reviewers (security, i18n, a11y/design) where useful. Owned paths must not overlap; shared paths name an owner.

## Skill format (`.claude/skills/<slug>/SKILL.md`)

```markdown
---
name: <slug>
description: <What it does and exactly when to use it — trigger words, file paths.>
---

# <Title>
## When to use
## Invariants (MUST / MUST NOT)
## Procedures (numbered, executable steps: add an endpoint, add a migration, add a translation key…)
## Checklists (before PR)
## References → references/*.md for long material (progressive disclosure)
```

Keep `SKILL.md` under ~300 lines; push detail into `references/`.

## Agent-friendly documentation rules

- Front-load: first paragraph says what the thing is and when you need it.
- Stable, descriptive headings; one topic per file; link by relative path.
- State invariants explicitly as MUST / MUST NOT; give the reason in one line.
- Real file paths, commands, and example payloads — no hand-waving.
- Glossary terms are used consistently (`docs/glossary.md`, vi/en).
- Every decision with trade-offs gets an ADR in `docs/adr/NNNN-<slug>.md`.
- Root `AGENTS.md` is the entry point; `CLAUDE.md` imports it; `docs/llms.txt` indexes docs.

## Product AI-agent surface (every domain)

Each spec lists the domain's read models and actions that the in-product agent (topic 08) may use: name, input/output schema (Zod), required permission, tenant scoping, read vs write, whether write needs human confirmation. Customer-supplied text (notes, reviews, Zalo messages) is untrusted input to the agent.
