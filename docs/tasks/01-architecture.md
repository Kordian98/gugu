# 01 — Architecture, monorepo, tooling, engineering rules

> **Owner agent:** `architecture` (`.claude/agents/architecture.md`) · **Skill:** `.claude/skills/architecture/` · **Domain doc:** `docs/domains/architecture.md`
> **Master prompt sections:** 1, 3.1–3.2, 4, 25, 29 · **Status:** spec, not implemented
> **Verified against npm/nodejs.org on 2026-11-02** (re-check on scaffold day; see §4.1).

This spec defines the monorepo layout, the toolchain and its versions, package boundaries, the engineering rules, and the AI-first development workflow (orchestrator, domain subagents, skills, docs, ADRs) that every other topic (02–13) builds on.

---

## 1. Scope

### In
- Monorepo layout, workspace tooling, task runner, TypeScript config, lint/format.
- Toolchain version baseline and upgrade policy.
- Package dependency rules (what may import what).
- Frontend app shell architecture (Expo + Expo Router, route groups, providers, state layers). The route tree itself is shared with topic 10.
- Backend modular-monolith structure (NestJS module shape, layering, cross-module communication rules).
- API contract pipeline: OpenAPI → generated client → TanStack Query hooks.
- Config and environment handling, secrets boundaries.
- Engineering rules (section 29), turned into enforceable checks.
- Performance and scalability baseline (section 25) at the architecture level.
- **AI-first development workflow**: orchestrator + domain subagents, reviewer agents, skills, `docs/llms.txt`, ADR process, keeping agents/skills in sync with code.

### Out (owned elsewhere)
- Design tokens and components → 02. Locale files and i18n runtime → 03. Prisma schema → 04. Auth/RBAC → 05. Booking engine → 06. SEO rendering details → 10. Docker/CI/EAS details → 13. Product AI agent runtime → 08.

---

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "Latest stable versions" with no baseline → every agent picks different versions. | Pin a version baseline (§4.1) in `docs/adr/0001-toolchain-baseline.md`. Re-verify on scaffold day. |
| G2 | NativeWind: the stable line is **v4.2.x**; v5 is still `rc` (5.0.0-rc.1) and needs Tailwind v4 + Reanimated 4. The prompt says "latest stable". | Start on **NativeWind v5 rc** only if it passes a 1-day spike on SDK 58 (web + iOS + Android, dark mode, SSR CSS). Otherwise use **v4.2.x + Tailwind v3.4** and plan to migrate later. Recorded in an ADR. Design tokens live in `packages/design-system` as plain TS, so the styling engine can be swapped. |
| G3 | **Expo SDK 58 makes `web.output: "server"` the default**, and Expo Router server rendering is still labelled **alpha**. You cannot mix static and server output in one project. The prompt asks for "static for some, SSR for others". | Architecture allows a single web output mode. Default plan: `output: "server"` deployed as a Node/edge server (Expo server adapter), with HTTP caching (CDN `s-maxage` + stale-while-revalidate) so public pages behave like ISR. Fallback if SSR alpha blocks us: `output: "static"` + a small pre-render/SEO edge worker for salon pages. **Topic 10 owns this decision**; topic 01 only guarantees the app shell has no SSR-unsafe globals (see rule R14). |
| G4 | Prisma: stable is **7.10.x** (Rust-free client, driver adapters, `prisma-client` generator); npm `latest` points at an 8.0 RC. PostGIS types are still unsupported. | Use Prisma 7.x stable with `@prisma/adapter-pg`. **Never install a pre-release.** Geo columns and exclusion constraints go in raw-SQL migrations, accessed through `$queryRaw`/TypedSQL inside a repository layer (details → 04). |
| G5 | NestJS: **v12** is current (12.3.x, Aug 2026); the prompt assumes nothing. | NestJS 12 + Express 5 adapter (Fastify is optional; not needed for MVP). |
| G6 | `apps/app/app/[locale]/...` as the route root breaks native: native deep links rarely carry a locale, and every native screen would need a locale segment. | Web URLs keep the `/vi/...` and `/en/...` prefix (SEO). Native resolves locale from the persisted preference. Implementation: `[locale]` segment exists in the tree; native navigation always injects the current locale; deep links without a locale are redirected by a root `+native-intent` / redirect. Final route tree → topic 10. |
| G7 | `packages/types` and `packages/validation` and `packages/domain` overlap; types derived from Zod would be duplicated. | Merge: **`packages/contracts`** (Zod schemas + inferred types + error codes, shared by API and app). `packages/domain` holds pure business logic (no I/O). No separate `types` package. |
| G8 | `packages/api-client`: hand-written vs generated is unspecified → drift. | Generated from OpenAPI (`orval` or `@hey-api/openapi-ts`; pick in a spike) into typed fetchers + TanStack Query hooks. CI fails if the generated client is out of date. |
| G9 | "No giant components/services" has no threshold. | Lint guardrails: max 300 lines per file (warn), max ~400 (error) except generated files; one NestJS service per use-case cluster; complexity limit. Reviewer agent enforces. |
| G10 | No rule for cross-module calls in the modular monolith → hidden coupling. | Modules expose a public `*.facade.ts` (or exported service) and domain events; **no importing another module's repository or Prisma models directly**. Enforced by `eslint-plugin-boundaries` / dependency-cruiser. |
| G11 | No idempotency, error-envelope, pagination or ID conventions for the API. | Standard: RFC 9457 problem+json errors with stable `code`; cursor pagination; `Idempotency-Key` on mutating booking/notification endpoints; UUIDv7 IDs (sortable). ADR-0003. |
| G12 | No observability contract beyond "Sentry + structured logging". | Pino JSON logs with `requestId`, `tenantId`, `actorId`; OpenTelemetry traces (API + BullMQ); Sentry on app and API with release + source maps. Details → 13. |
| G13 | Engineering rules are prose, not checks. | Each rule maps to an automated check or a reviewer-agent checklist item (§3.6). |
| G14 | No AI-first workflow, while the user wants everything built by agents. | §3.8: orchestrator + domain subagents + reviewer agents + skills + `llms.txt` + ADRs + a sync check in CI. |
| G15 | The product AI agent (topic 08) needs stable, typed, tenant-scoped read models and actions; the prompt has no layer for them. | Reserve `packages/agent-tools` (tool definitions = Zod schemas from `contracts` + permission + scope) and a backend `AgentToolsModule` that calls module facades only. Every domain spec lists its tools. |
| G16 | Node version unspecified. | Node **26 LTS** ("Lithium") pinned via `.nvmrc` + `engines` + `packageManager`. |
| G17 | Package manager / task runner unspecified. | **pnpm 11.x** (stable line; 12.x is newer but check Expo/Metro compatibility in the spike) with workspaces + **Turborepo 2.x** with remote cache. Expo is pnpm-compatible with `node-linker=hoisted` as the fallback if Metro resolution breaks. |

---

## 3. Refined requirements

### 3.1 Repository layout

```
gugu/
  AGENTS.md · CLAUDE.md (@AGENTS.md)
  .claude/agents/  .claude/skills/          # AI-first (see §3.8)
  apps/
    app/                 # the ONLY frontend (Expo, iOS/Android/web)
      app/               # Expo Router routes (tree owned by topic 10)
      src/
        features/<feature>/   # screens' logic, hooks, feature components
        components/           # app-specific composites (generic UI lives in design-system)
        providers/            # QueryClient, i18n, theme, auth, analytics
        lib/                  # platform adapters (storage, location, haptics)
        stores/               # Zustand (client-only UI state)
      app.config.ts           # dynamic config per env (dev/staging/prod)
      eas.json
    api/
      src/
        main.ts
        modules/<module>/     # see §3.4
        common/               # guards, interceptors, filters, pipes, decorators
        infrastructure/       # prisma, redis, bullmq, s3, mail/sms providers, otel
        jobs/                 # BullMQ processors (thin; call module facades)
      prisma/                 # schema + migrations (incl. raw SQL)
      test/
  packages/
    contracts/      # Zod schemas, inferred types, error codes, enums (API ↔ app)
    domain/         # pure logic: slot math, state machines, money/VND, commission rules
    api-client/     # GENERATED from OpenAPI + TanStack Query hooks
    localization/   # vi/en resources + typed keys (owned by 03)
    design-system/  # tokens + RN primitives (owned by 02)
    agent-tools/    # product AI-agent tool definitions (owned by 08, shape defined here)
    config/         # tsconfig bases, eslint config, prettier, jest/vitest presets
  infra/ docker/ deployment/   # owned by 13
  docs/
    llms.txt · glossary.md · ai-first-conventions.md
    tasks/ domains/ adr/ api/ (generated OpenAPI snapshot)
```

### 3.2 Dependency rules (enforced)

| Package | May import | Must not import |
|---|---|---|
| `contracts` | `zod` only | anything platform-, React- or Nest-specific |
| `domain` | `contracts`, date/time lib | React, RN, Nest, Prisma, I/O |
| `localization` | none (data + typed helpers) | React Native |
| `design-system` | `react`, `react-native`, styling lib, `localization` types | `api-client`, app features, Nest |
| `api-client` | `contracts`, `@tanstack/react-query` | RN-only modules (must run on web/native/SSR) |
| `agent-tools` | `contracts` | Nest, Prisma, React |
| `apps/app` | all packages above | `apps/api`, Prisma |
| `apps/api` | `contracts`, `domain`, `localization`, `agent-tools` | `design-system`, `api-client`, React |
| `apps/api/modules/X` | own files, `common`, `infrastructure`, other modules' **facades/events only** | other modules' repositories/entities |

### 3.3 Frontend architecture (`apps/app`)
- Expo Router with route groups `(public)`, `(customer)`, `(business)`, `(staff)`, `(admin)`; each group has its own layout and guard. Guards are UX only; the API enforces auth (05).
- **State layers:** server state = TanStack Query only; client UI state = Zustand (small slices, no server data copies); forms = React Hook Form + Zod resolvers from `contracts`; URL = source of truth for search/filter state on web.
- **Platform files** (`.native.tsx` / `.web.tsx`) only when behaviour genuinely differs; each one needs a one-line comment saying why.
- Responsive breakpoints come from `design-system` tokens (02); layouts use `useBreakpoint()`, not ad-hoc `Platform.OS` checks.
- Data fetching: query keys factory per feature; `AbortSignal` passed to every fetcher (request cancellation); `staleTime` defaults per resource class (catalog long, availability short).
- SSR-safety: no `window`/`localStorage` access at module scope; storage behind `lib/storage` with SecureStore (native) / httpOnly cookie strategy (web, 05).
- Large or optional features (3D hero, admin, charts) are lazy-loaded (`React.lazy` / route-level splitting) and never in the native or public-page critical path.

### 3.4 Backend architecture (`apps/api`)
- **Modular monolith.** Module list from master prompt §3.3 plus `Zalo` (09), `AgentTools`/`Assistant` (08), `Metrics` (read models shared by CRM dashboards and the AI agent, 07/08).
- **Module shape:**
  ```
  modules/bookings/
    bookings.module.ts
    bookings.controller.ts        # HTTP only: validate (Zod pipe), authorize, call service
    bookings.facade.ts            # public API for other modules + agent tools
    application/                  # use-cases (create-booking.use-case.ts …)
    domain/                       # module-specific rules (pure), uses packages/domain
    infrastructure/               # repositories (Prisma/raw SQL), external adapters
    events/                       # domain events emitted/handled
    bookings.e2e-spec.ts
  ```
- Request validation: Zod schemas from `contracts` via a global `ZodValidationPipe`; OpenAPI generated from the same schemas (`nestjs-zod` or `@anatine/zod-openapi`; pick in a spike). One source of truth for request/response types.
- Response serialization always goes through an explicit output schema (no leaking Prisma rows: internal notes, OTP hashes, attribution metadata).
- Cross-module side effects go through **domain events** (in-process event bus); async or slow work goes to **BullMQ** via an outbox table, so jobs fire only after commit.
- Tenant context: a request-scoped `TenantContext` (salonId, role, permissions) is resolved by a guard and required by every tenant repository method (05 defines RBAC; 04 defines RLS).
- API versioning: URI `/api/v1`. Breaking changes need a new version; additive changes are allowed.

### 3.5 Conventions
- IDs: UUIDv7. Timestamps: UTC `timestamptz`; display in salon timezone (06).
- Money: integer VND (`bigint`/int, no decimals), formatted by `localization` helpers.
- Errors: RFC 9457 `application/problem+json` with `code` (stable, localized on the client via `errors.*` keys), `traceId`.
- Pagination: cursor-based (`?cursor=&limit=`), max limit 100.
- Idempotency: `Idempotency-Key` header required on booking create/reschedule and other non-repeatable mutations; stored in Redis for 24 h.
- Dates in API: ISO 8601 with offset; local-date fields (e.g. schedule day) as `YYYY-MM-DD` + explicit `timezone`.
- Naming: kebab-case files, PascalCase types, camelCase fields in JSON, snake_case in SQL.

### 3.6 Engineering rules → enforcement

| Rule (master §29) | Enforcement |
|---|---|
| TS strict, no unnecessary `any` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; ESLint `no-explicit-any` = error (allowed only with `// reason:` comment) |
| No hardcoded UI strings | ESLint rule (`i18next/no-literal-string` or custom) on `apps/app` + `design-system`; i18n reviewer agent |
| No duplicated business logic | Logic lives in `packages/domain` and is imported by the API (and the app only for display hints); dependency-cruiser; reviewer checklist |
| No frontend-only availability | Availability only through API endpoints; app cannot import slot math for decisions (lint boundary) |
| No unvalidated request data | Global Zod pipe; controller without schema fails a custom lint/test |
| No insecure tenant access | Tenant isolation e2e suite (05) runs in CI; repository methods require `TenantContext` by type |
| No giant components/services | max-lines lint + complexity; reviewer agent |
| No secrets in Git | gitleaks in pre-commit + CI; `.env.example` only |
| No unhandled errors / silent failures | Global exception filter + Sentry; ESLint `no-floating-promises`, `no-empty` catch |
| Loading/empty/error states | Design-system `QueryBoundary` pattern + UI reviewer checklist; Storybook/visual states (02) |
| Tests for critical booking logic | Coverage gate on `packages/domain` booking + `modules/bookings` (≥ 90% lines), 06 test matrix |
| No WebView app, no Next.js, single frontend | CI check: only one app in `apps/` with a `react` dependency; ban `next`, `react-native-webview` in app root except whitelisted uses |
| Feature status honesty | `docs/domains/<slug>.md` has a "Status" table (implemented / UI-only / not started); PR template asks for it |

### 3.7 Performance and scalability baseline (§25)
- Budgets (initial; 13 measures them): public web page JS ≤ 200 KB gzip excluding lazy 3D; LCP ≤ 2.5 s on a "Fast 3G / mid Android" profile; API p95 ≤ 300 ms for reads, ≤ 600 ms for booking create.
- Images through the media service with responsive variants (04/21) and `expo-image` caching.
- No N+1 queries: Prisma `include`/`select` reviewed; a query-count assertion helper in integration tests for list endpoints.
- Redis for caching public read models (salon profile, category lists) with event-driven invalidation; never cache availability for more than a few seconds.
- Design for 10k salons / 500k customers / 10M bookings: partition-ready booking tables (by month, later), indexes reviewed per query in 04.
- Modular monolith; no microservices. Module boundaries (§3.2) keep later extraction possible (bookings, notifications are the first candidates).

### 3.8 AI-first development workflow

**Roles**
- **Orchestrator** (`.claude/agents/orchestrator.md`): takes a task from `docs/tasks/00-roadmap.md`, splits it, delegates to domain agents, merges results, runs the verification gates. It does not write domain code itself except for glue.
- **Domain agents** (one per topic, `.claude/agents/<slug>.md`): own their paths (ownership map in `.claude/skills/architecture/references/ownership.md`), load their skill first, write code + tests + docs.
- **Reviewer agents** (read-only tools): `security-reviewer`, `i18n-reviewer`, `ui-reviewer` (design/a11y/states), `architecture-reviewer` (boundaries, rules §3.6), `tenant-isolation-reviewer`. The orchestrator runs the relevant reviewers before a task is marked done. Their definitions are created by the owning topics (05 security/tenancy, 03 i18n, 02 UI); `architecture-reviewer` is part of this topic, folded into the `architecture` agent in review mode.
- **Skills**: procedural know-how (add a module, add an endpoint, add a migration, add a translation key, add an agent tool). They are short; detail goes in `references/`.

**Task lifecycle (definition of done)**
1. The orchestrator reads the roadmap step and the relevant `docs/tasks/NN-*.md`.
2. It delegates to the domain agent(s) with explicit owned paths and acceptance criteria.
3. The agent implements code, tests and docs, and updates `docs/domains/<slug>.md` (Status table, file map, invariants).
4. Gates: `pnpm turbo lint typecheck test`, the generated client is up to date, i18n key coverage, boundaries check, `agents:check` (below).
5. Reviewer agents return findings; fixes are applied.
6. The orchestrator updates roadmap status and reports *exactly* what was done vs only UI vs not started.

**Keeping agents, skills and docs in sync with code**
- `pnpm agents:check` (script in `packages/config`, CI job):
  - every path listed in an agent's "Owned paths" exists or is marked `planned`;
  - every NestJS module and `packages/*` has an owner in `ownership.md`;
  - every skill referenced by an agent exists; every `docs/llms.txt` link resolves;
  - each `docs/domains/*.md` Status table is newer than the last change to its owned paths (warn).
- PR template checkbox: "Updated domain doc / skill / agent if behaviour or conventions changed."
- Any convention change → ADR + skill update in the same PR.

**ADR process**
- `docs/adr/NNNN-<slug>.md`, template: Context · Decision · Alternatives considered · Consequences · Status (proposed/accepted/superseded by NNNN).
- Required for: toolchain/version choices, cross-cutting patterns, anything that contradicts the master prompt, security-relevant trade-offs.
- Initial ADRs owned by 01: 0001 toolchain baseline, 0002 monorepo & package boundaries, 0003 API conventions (errors, pagination, idempotency, IDs), 0004 styling engine (NativeWind v4 vs v5), 0005 AI-first workflow.

**`docs/llms.txt`**: llms.txt-format index (title, one-line summary, sections with links + one-line descriptions) for docs, ADRs, domain docs, skills. Updated whenever a doc is added.

---

## 4. Proposed technical approach

### 4.1 Version baseline (verified 2026-11-02; pin exact at scaffold)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 26 LTS (26.13.x) | `.nvmrc`, `engines` |
| pnpm | 11.28.x (fallback) / 12.x if Expo spike passes | `packageManager` field; corepack |
| Turborepo | 2.11.x | remote cache in CI |
| TypeScript | latest 5.x/6.x supported by Expo SDK 58 | match `expo` peer range |
| Expo SDK | **58** (expo 58.0.x) | SDK 58 bundles RN **0.88.1**, RNW **~0.21.4**, Reanimated **4.7.1**, expo-router **~58.0.x** |
| Expo Router | ~58.0.x | `web.output` default is now `"server"` (alpha SSR); see G3 |
| NativeWind | 4.2.x stable, or 5.0.0-rc after spike | ADR-0004 |
| Tailwind CSS | 3.4 (with NW v4) / 4.x (with NW v5) | |
| TanStack Query | 5.x (5.105) | |
| Zustand | 5.x | |
| React Hook Form | 7.x (7.91) | v8 is beta; don't use |
| Zod | 4.x (4.6) | |
| NestJS | **12.x** (12.3) | Express 5 adapter |
| Prisma | **7.10.x** stable | not 8.0 RC; driver adapter `pg` |
| PostgreSQL | 17 + PostGIS 3.5 (Docker `postgis/postgis`) | confirm image tags in 13 |
| Redis | 7.x / Valkey 8 | BullMQ compatible |
| BullMQ | latest 5.x | |

Rule: install with `npx expo install` for anything Expo manages, so versions match the SDK. No pre-release packages without an ADR.

### 4.2 Why these choices
- **Expo SDK 58**: latest stable SDK, with the newest RN and Router. Following Expo's SDK cadence (about 3 per year) keeps native deps aligned. Upgrade policy: move to a new SDK within ~6 weeks of release, after a green spike branch.
- **Generated API client**: removes a whole class of drift bugs and gives AI agents typed, discoverable calls.
- **`contracts` as the single schema source**: the same Zod schema validates the request in Nest, generates OpenAPI, types the client, drives forms, and defines product-agent tool inputs (08).
- **Outbox + BullMQ**: notifications and attribution must never fire for a rolled-back booking.

### 4.3 Spikes before Phase 1 code (time-boxed)
1. Expo SDK 58 + pnpm (11 vs 12) + Turborepo + Metro monorepo resolution on iOS, Android, web: 0.5 d.
2. NativeWind v5 rc vs v4.2 on SDK 58 incl. web server output and dark mode: 1 d → ADR-0004.
3. Zod → OpenAPI in Nest 12 (`nestjs-zod` vs alternatives) + client generator (orval vs hey-api): 0.5 d.
4. Expo Router server output deployed behind a CDN with cache headers: 0.5 d (handover to 10).

---

## 5. Acceptance criteria
1. `pnpm install && pnpm turbo build` succeeds from a clean clone on macOS and Linux CI with Node 26.
2. `apps/app` launches on web (`expo start --web`), iOS dev build and Android dev build from the same code; a sample shared screen renders identically in structure on all three.
3. `apps/api` starts, serves `/api/v1/health` and Swagger at `/api/docs`; the OpenAPI snapshot is committed to `docs/api/openapi.json`.
4. `packages/api-client` is generated from that OpenAPI; CI fails when it is stale (`git diff --exit-code` after regen).
5. Dependency-boundary check fails on a deliberate violation (e.g. `design-system` importing `api-client`, module A importing module B's repository).
6. ESLint fails on a hardcoded JSX string, an `any` without reason, a floating promise.
7. gitleaks blocks a committed fake secret.
8. `pnpm agents:check` passes, and fails when an agent references a missing skill or an unowned module exists.
9. ADRs 0001–0005 exist and are accepted; `docs/llms.txt` links every doc.
10. Every package `tsconfig` extends `packages/config/tsconfig.base.json` with strict flags; `pnpm turbo typecheck` is green.

---

## 6. Dependencies on other topics
- **02** design-system package shape, breakpoints, styling engine choice (shared ADR-0004).
- **03** localization package API and lint rule for literals.
- **04** Prisma setup, raw-SQL migration convention, repository pattern details.
- **05** `TenantContext`, guards, auth storage adapters (cookie vs SecureStore).
- **08** `agent-tools` package contents and `AgentToolsModule`.
- **10** final route tree and web output mode (server vs static).
- **13** Docker Compose, CI pipelines, EAS profiles, observability wiring.
- Provides to **all**: layout, boundaries, conventions, AI-first workflow, ownership map.

---

## 7. Suggested sub-milestones
1. **A1 Spikes** (§4.3) → ADR-0001/0004 accepted.
2. **A2 Workspace skeleton**: pnpm + Turbo + `packages/config` + strict TS + ESLint/Prettier + gitleaks + boundaries.
3. **A3 App shell**: Expo SDK 58 app, Router with route groups, providers (Query, i18n stub, theme stub), one shared screen on 3 platforms.
4. **A4 API shell**: Nest 12, health, Zod pipe, problem+json filter, Pino, OpenAPI → `docs/api/openapi.json`.
5. **A5 Contract pipeline**: `contracts` → OpenAPI → `api-client` generation + CI staleness check.
6. **A6 AI-first tooling**: `agents:check`, PR template, `llms.txt`, ownership map, ADR-0005, reviewer agent definitions handed to owners.
7. **A7 Docs**: `docs/domains/architecture.md` Status = implemented for the above.

---

## 8. AI-first deliverables
| Artifact | Path | State |
|---|---|---|
| Subagent (architecture + architecture review mode) | `.claude/agents/architecture.md` | created |
| Orchestrator subagent | `.claude/agents/orchestrator.md` | created |
| Skill | `.claude/skills/architecture/SKILL.md` + `references/ownership.md`, `references/module-template.md`, `references/adr-template.md` | created |
| Domain doc | `docs/domains/architecture.md` | skeleton |
| Glossary | `docs/glossary.md` | seed |
| Docs index | `docs/llms.txt` | seed |
| ADRs 0001–0005 | `docs/adr/` | to write in A1/A6 |

---

## 9. Product AI-agent surface
Topic 01 exposes no business data. It defines the **framework** every domain uses (details → 08):
- Tools are declared in `packages/agent-tools/<domain>/*.tool.ts`: `name` (snake_case, `domain_verb_noun`, e.g. `bookings_count_by_period`), `description` (vi/en), `input`/`output` Zod schemas from `contracts`, `permission` (05 permission key), `scope: 'tenant'` (always), `kind: 'read' | 'write'`, `requiresConfirmation` (always true for writes).
- The backend `AgentToolsModule` executes tools through **module facades only**, under the caller's `TenantContext`, with an audit-log entry per call.
- The same registry can be exported as an MCP server later without changing the tools.
- Platform-level tool for the agent from this topic: `system_get_capabilities` (lists enabled tools/features for the current salon plan). Read-only, no PII.

---

## 10. Open questions for the product owner
1. Is a NativeWind v5 **release candidate** acceptable if the spike is green, or must we use only GA packages (v4.2)?
2. Web hosting target for the Expo server output: Vercel / Cloudflare / a Node container in a Singapore region / Vietnam-local hosting? This affects data residency (Decree 13/2023, see 05) and SSR mode (10).
3. Remote Turborepo cache and EAS: which org/accounts own them?
4. Human review policy: may agents merge to `main` after green gates and reviewer agents, or does every PR need a human approval?
5. Which LLM/coding-agent tooling does the team standardise on besides Claude Code (Cursor, Codex)? If several, we also keep an `AGENTS.md`-compatible layout (already done) and avoid Claude-only conventions in docs.
