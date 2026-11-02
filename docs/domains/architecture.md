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
| ADRs 0001–0005 | not started | — |

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
_Links to accepted ADRs._
