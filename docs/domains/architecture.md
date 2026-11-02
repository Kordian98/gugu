# Architecture (domain doc)

How the GuGu repo is put together: one Expo app, one NestJS API, shared TypeScript packages, and the AI-first workflow around them. Read this before adding a package, module or cross-cutting pattern. The spec with rationale is `docs/tasks/01-architecture.md`.

## Status
| Capability | State | Evidence |
|---|---|---|
| Workspace (pnpm + Turborepo + strict TS) | not started | — |
| App shell (Expo SDK 58, Router, providers) | not started | — |
| API shell (NestJS 12, health, Zod pipe, problem+json) | not started | — |
| contracts → OpenAPI → api-client pipeline | not started | — |
| Boundary + lint + secret checks in CI | not started | — |
| `agents:check`, ownership map, llms.txt | partial (docs only) | `.claude/skills/architecture/references/ownership.md` |
| ADRs 0001–0007 | planned (seeds in spec §3.8) | `docs/tasks/01-architecture.md` |
| Local git workflow (worktrees, gates, local merge) | defined (docs only) | `.claude/skills/architecture/references/git-workflow.md` |

## Map
_Filled in as code lands: package → purpose → entry file._

| Path | Purpose |
|---|---|
| `apps/app` | Universal Expo app (iOS/Android/web) |
| `apps/api` | NestJS modular monolith, `/api/v1` |
| `packages/contracts` | Zod schemas + types (single source of truth) |
| `packages/domain` | Pure business logic |
| `packages/api-client` | Generated client + TanStack Query hooks |
| `packages/agent-tools` | Product AI-agent tool definitions |

## Invariants
See `.claude/skills/architecture/SKILL.md` → Invariants. They are not repeated here, so there is one source.

## Key flows
_To be documented: request lifecycle (guard → Zod pipe → use-case → outbox → job), client data flow (hook → fetcher → API), codegen flow._

## Decisions
- Hosting: AWS ap-southeast-1 (Singapore) → ADR-0007 (planned).
- Packages: `contracts` + `domain`; no `types`/`validation` (X3) → ADR-0002 (planned).
- Web output mode: undecided until spike S1 (X8) → ADR-0006.
- Privacy regime: PDPL 91/2025/QH15 + Decree 356/2025/ND-CP (X1); no compliance claims.
- Merge policy: agents merge locally after gates + reviewers; no remote yet.

_Links to accepted ADRs go here._
