# Architecture (domain doc)

How the GuGu repo is put together: one Expo app, one NestJS API, shared TypeScript packages, and the AI-first workflow around them. Read this before adding a package, module or cross-cutting pattern. The spec with rationale is `docs/tasks/01-architecture.md`.

## Status
| Capability | State | Evidence |
|---|---|---|
| Workspace (pnpm 10.26.2 + Turborepo 2.11 + strict TS) | implemented | `pnpm verify` green |
| Lint (ESLint 9 + typescript-eslint strict + i18n literal ban) | implemented | `pnpm lint` |
| Package boundaries (dependency-cruiser) | implemented | `pnpm boundaries`; negative tests: cross-module repository import and unresolved import both fail |
| Secret scan | implemented (fallback) | `pnpm secrets`: built-in pattern scan; gitleaks used automatically once installed |
| `packages/contracts` common schemas (problem+json, cursor pagination, UUIDv7, locale) | implemented | 5 Vitest tests |
| App shell (Expo SDK 58, Router, `[locale]` + 5 route groups, providers, shell screen) | implemented | web: export + browser render of `/vi`, `/en`, `/vi/business`, `/en/me`, `/vi/staff`, `/vi/admin`; `/` → `/vi`; iOS: see below |
| Native: iOS dev build | implemented | `cd apps/app && npx expo run:ios --port 8096` → builds (Xcode 26.4.1), installs `vn.gugu.app.dev` on iPhone 17 Pro Max sim (iOS 26.4), `/` → `/vi`, shell screen renders with NativeWind styles |
| Native: Android dev build | pending | no Android SDK on dev Mac |
| Unknown locale → HTTP 404 | partial | renders "Unmatched" but status is 200; real 404 + `+not-found` owned by topic 10 |
| API shell (NestJS 12, health, Zod pipe, problem+json) | not started | — |
| contracts → OpenAPI → api-client pipeline | not started | — |
| Boundary + lint + secret checks in CI | not started | — |
| `agents:check`, ownership map, llms.txt | implemented | `pnpm agents:check` |
| ADRs | 0001, 0004 accepted; 0002/0003/0005–0007 planned | `docs/adr/README.md` |
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

## How to run (localhost)
```bash
pnpm install
pnpm verify                         # format, boundaries, secrets, lint, typecheck, tests
pnpm agents:check
pnpm dev:web                        # Expo dev server for web
cd apps/app && npx expo run:ios --port 8096   # iOS dev build; use a free port
```

## Key flows
_To be documented: request lifecycle (guard → Zod pipe → use-case → outbox → job), client data flow (hook → fetcher → API), codegen flow._

## Decisions
- Hosting: AWS ap-southeast-1 (Singapore) → ADR-0007 (planned).
- Packages: `contracts` + `domain`; no `types`/`validation` (X3) → ADR-0002 (planned).
- Web output mode: undecided until spike S1 (X8) → ADR-0006.
- Privacy regime: PDPL 91/2025/QH15 + Decree 356/2025/ND-CP (X1); no compliance claims.
- Merge policy: agents merge locally after gates + reviewers; no remote yet.

_Links to accepted ADRs go here._
