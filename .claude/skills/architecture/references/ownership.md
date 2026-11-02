# Ownership map

Every path has exactly one primary owner agent. Others propose changes through the orchestrator. `pnpm agents:check` validates this file against `.claude/agents/*.md`. Agent names below match the files in `.claude/agents/`.

## Canonical package layout (X3)
- `packages/contracts/src/<domain>/`: Zod schemas, inferred types, error codes. **Replaces `packages/validation` and `packages/types`**; wherever an agent, skill or spec says `packages/validation/...` or `packages/types/...`, read it as `packages/contracts/src/...`.
- `packages/domain/src/<area>/`: pure logic, no I/O. Wherever an agent says `packages/domain/<area>`, read it as `packages/domain/src/<area>`.
- Frontend: `apps/app/features/<feature>/`, `apps/app/services/`, `apps/app/providers/` (no `src/` folder in `apps/app`).

## Paths

| Path | Owner agent | Topic |
|---|---|---|
| `scripts/{agents-check,secrets-scan}.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore` | architecture | 01 |
| Root config (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `.nvmrc`, `.npmrc`, `.editorconfig`, `.gitleaks.toml`), `packages/config/**`, `packages/api-client/**` (generated) | architecture | 01 |
| `packages/contracts/` structure + `src/index.ts`, `src/common/**` (problem+json, pagination, ids) | architecture | 01 |
| `packages/contracts/src/<domain>/**` | that domain's owner (see rows below) | — |
| `apps/app/app/_layout.tsx`, `apps/app/app/index.tsx`, `apps/app/app/[locale]/_layout.tsx`, `apps/app/app/[locale]/(*)/_layout.tsx` (group shells), `apps/app/providers/**`, `apps/app/features/shell/**`, `apps/app/{global.css,metro.config.js,postcss.config.mjs,tsconfig.json,eslint.config.mjs,package.json}`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts` | architecture | 01 |
| `.claude/skills/roadmap-tracker/**`, `docs/tasks/tracker-inbox.jsonl` (sync + truncate), live tracker artifact [GuGu Roadmap](https://claude.ai/artifact/CkweFTJGUNC1M9hoCAmwn3) | orchestrator | 01 |
| `docs/adr/**` (index + 0001–0005), `docs/llms.txt`, `docs/glossary.md` (structure), `docs/domains/architecture.md`, `.claude/skills/architecture/**`, `.claude/agents/{architecture,orchestrator}.md` | architecture | 01 |
| `packages/design-system/**`, `apps/app/features/hero/**`, `apps/app/styles/**`, `design/**` | design-system | 02 |
| `packages/localization/**` (except notification templates) | localization | 03 |
| `apps/api/src/common/**` (except guards), `apps/api/src/infrastructure/**`, `apps/api/src/jobs/**`, `apps/api/src/{bootstrap,worker,worker.module}.ts`, `apps/api/prisma/**`, `apps/api/prisma.config.ts`, `apps/api/{package.json,rolldown.config.ts,vitest*.config.ts,tsconfig.json,eslint.config.mjs,scripts/**}`, `apps/api/test/http-app.ts`, `modules/{health,media}/**`, `packages/contracts/src/health/**` | backend-database | 04 |
| `modules/{auth,authorization,audit,privacy,salons}/**` (`salons` = registration + minimal salon read models until topic 07 takes the workspace), `apps/api/src/common/guards/**`, `packages/domain/src/auth/**` (permission matrix), `packages/domain/src/phone/**`, `packages/contracts/src/{auth,salon}/**`, `apps/app/services/auth/**`, `apps/app/features/{auth,salon-join}/**`, `apps/api/test/{auth-fakes,mailpit,rate-limits}.ts`, `apps/api/test/factories/identity.ts`, RLS SQL | auth-security | 05 |
| `modules/{availability,bookings,booking-engine}/**`, `packages/domain/src/booking/**`, `packages/contracts/src/booking/**`, occupancy/idempotency SQL | booking-engine | 06 |
| `modules/{salon-crm,customers-crm,salon-settings,insights,catalog,team}/**`, `packages/domain/src/metrics/**` (metric registry, `RevenueKind`), `apps/app/app/[locale]/(business)/**`, `apps/app/app/[locale]/(staff)/**`, `apps/app/features/salon-crm/**` | salon-crm | 07 |
| `packages/agent-tools/**` (framework), `modules/{assistant,ai-import}/**`, `packages/contracts/src/ai-import/**`, `packages/domain/src/ai-import/**`, `apps/api/assets/models/**`, `apps/app/features/{assistant,ai-import}/**`, `evals/assistant/**`, `apps/api/evals/assistant/**` | ai-agent | 08 |
| `modules/zalo/**`, `apps/app/features/crm-inbox/**`, `apps/zalo-miniapp/**` (after ADR) | zalo | 09 |
| `modules/search/**`, `apps/app/app/[locale]/(public)/**`, `apps/app/app/+html.tsx`, `apps/app/features/{home,search,salon-public}/**`, sitemap/robots/web `llms.txt` routes | marketplace-seo | 10 |
| `modules/{customers,favorites,reviews,moderation,notifications,notification-channels}/**`, `apps/app/app/[locale]/(customer)/**`, `apps/app/features/{account,favorites,reviews,notifications}/**`, `packages/localization/*/notifications/**` | customer-notifications | 11 |
| `modules/{attribution,commission,subscriptions,usage,feature-flags,analytics,trust,admin}/**`, `packages/analytics/**`, `apps/app/app/[locale]/(admin)/**`, `apps/app/features/admin/**` | monetization-admin | 12 |
| `infra/**`, `.github/**`, `docker-compose*.yml` (first version + `infra/docker/postgres/**` created by backend-database in 04-S1; platform-devops owns them from 13-M13.1 on), `apps/app/eas.json`, `apps/app/app.config.ts` (build/linking parts), root scripts `bootstrap`/`reset`/`verify`, `docs/runbooks/**`, `docs/release/**` | platform-devops | 13 |
| `**/*.test.ts`, `**/*.spec.ts`, `apps/api/test/**` (except `test/fixtures/zalo`, `test/fixtures/ai-import`, `test/assistant`), `e2e/**`, `evals/**` (except `evals/assistant`) | test-engineer | 13 |
| per-module `agent-tools.ts` | module owner (reviewed by ai-agent) | — |
| `docs/domains/<slug>.md`, `docs/tasks/NN-<slug>.md`, `.claude/skills/<skill>/**`, `.claude/agents/<slug>.md` | that topic's owner | — |

## Resolved overlaps
- `apps/api/src/common/**`: backend-database owns it, except `common/guards/**`, which auth-security owns. Earlier drafts of the architecture agent claimed all of `common`.
- `modules/privacy/**`: **auth-security** is the primary owner (consent, export/deletion jobs). customer-notifications owns the customer-facing UI in `features/account/**` and calls the privacy facade.
- `package.json` / `turbo.json` scripts: architecture owns the files. platform-devops owns the `verify`/`bootstrap`/`reset` script bodies.
- `pnpm-lock.yaml`: only architecture changes it, or a dedicated dependency branch.

## Hot files (one task at a time; orchestrator holds the lock)
`apps/api/prisma/schema.prisma`, `packages/contracts/src/index.ts`, `apps/api/src/app.module.ts`, `package.json`, `pnpm-lock.yaml`, `turbo.json`, `docs/llms.txt`, `docs/tasks/00-roadmap.md`. (`docs/tasks/tracker-inbox.jsonl` is append-only for agents and only the orchestrator truncates it.)

## Needs owner follow-up (files outside topic 01)
- auth-security, backend-database agents/skills still reference `packages/validation`: change to `packages/contracts/src/<domain>` (X3).
- booking-engine, monetization-admin, salon-crm agents reference `packages/domain/<area>`: normalise to `packages/domain/src/<area>`.
