---
name: testing
description: How GuGu tests are organised, written, and run — test tiers (T0–T3), unit/integration/contract/E2E/native/load/LLM-eval conventions, the booking concurrency harness, the tenant-isolation matrix, deterministic seed and clock, provider-sink assertions. Use before writing or fixing any test, when CI fails, or when deciding which tier a test belongs to.
---

# Testing GuGu

> Status: target contract from `docs/tasks/13-platform-devops.md` §3.4, §3.6. Update paths/commands as they land.

## When to use
Writing tests for a change, diagnosing a red CI job, adding an endpoint (tenant matrix), touching booking logic (concurrency), touching the product AI agent (evals).

## Invariants (MUST / MUST NOT)
- MUST pick the cheapest tier that proves the behaviour: unit → integration → E2E.
- MUST use real Postgres+PostGIS and Redis for integration tests. MUST NOT mock the DB for booking, tenancy, search.
- MUST freeze time (`vi.useFakeTimers`/injected `Clock`) and use seed IDs; never depend on "now" or random order.
- Times: assert in UTC; render checks in `Asia/Ho_Chi_Minh`; include one DST timezone (e.g. `Europe/Warsaw`) in availability tests.
- MUST run user-facing journeys in `vi` and `en`.
- MUST NOT hit real SMS/ZNS/Zalo/email/push providers; assert via provider-sink (`GET :4010/messages`) and Mailpit API.
- MUST NOT leave flaky tests in T0/T1 — tag `@quarantine` + issue link.
- Every tenant-scoped endpoint MUST carry the tenant-scope annotation so the isolation matrix picks it up.

## Tiers

| Tier | When | Contents | Budget |
|---|---|---|---|
| T0 | every push | `pnpm verify`: format, lint, typecheck, unit, i18n parity, OpenAPI drift, Prisma drift | < 5 min |
| T1 | every PR | API integration (service containers), concurrency harness, tenant matrix, Playwright smoke (chromium, vi+en), migrations from empty + previous release | < 15 min |
| T2 | label `e2e-native`, nightly, pre-release | EAS Workflows builds + Maestro flows (Android, iOS) | — |
| T3 | nightly | full Playwright (chromium/webkit/mobile viewports), LLM evals, k6 vs staging, audits, quarantined tests | — |

## Commands
- All fast checks: `pnpm verify`
- One package unit tests: `pnpm --filter <pkg> test`
- API integration: `pnpm --filter api test:int` (needs `docker compose up -d --wait`)
- Web E2E: `pnpm --filter e2e-web exec playwright test [--grep @smoke] [--project=chromium]`
- Native E2E: `maestro test e2e/native/<flow>.yaml` (local) · `eas workflow:run .eas/workflows/e2e-tests.yml` (CI)
- Load: `k6 run e2e/load/<script>.js -e BASE_URL=...`
- Agent evals: `pnpm --filter evals run [--suite <name>]`

## Layout (target)
- Unit: colocated `*.test.ts` next to source (`packages/domain`, `apps/api/src/**`, `apps/app/**` for hooks/utils).
- API integration: `apps/api/test/integration/**`, factories in `apps/api/test/factories/`.
- Web E2E: `e2e/web/` (Playwright, page objects per area: marketplace, booking, business, admin).
- Native E2E: `e2e/native/*.yaml` (Maestro); use `testID`s, never text matching on translated strings — use translation keys exposed as `testID`/accessibility IDs.
- Load: `e2e/load/`. Evals: `evals/` (datasets in `evals/datasets/*.jsonl`).

## Procedure: add an API endpoint test
1. Annotate the controller with the tenant scope (see topic 05 spec) — the isolation matrix will auto-generate cross-tenant cases.
2. Write integration tests for: happy path, validation error (localized message key), unauthenticated, wrong role, cross-tenant (auto), not-found.
3. Regenerate the API client (`pnpm --filter api-client generate`) so OpenAPI drift check passes.

## Procedure: booking engine changes
1. Unit-test the pure availability function with table-driven cases (hours, breaks, time off, holidays, buffers, variants, multi-service, resources, capacity).
2. Integration-test create/reschedule/cancel transitions against Postgres, including the exclusion constraint.
3. Run the concurrency harness: N parallel creates for the same slot → exactly `capacity` succeed, others get a conflict error code, no orphan holds after TTL.
4. Check state-transition table: every disallowed transition returns an error and writes no history row.

## Procedure: diagnose a red CI job
1. Read the job summary (failing test, file:line, first error).
2. Download JUnit/Playwright trace artifacts if needed (`gh run download <id>`).
3. Reproduce locally with the exact command from the summary and the same seed.
4. If non-deterministic after 3 local runs: quarantine + issue, then fix root cause.

## Procedure: LLM evals for the product agent
1. Each case: locale, salon role, question, expected tool calls (name + key args), expected answer facts (numbers from seed), forbidden behaviours.
2. Include probes: ask about another salon, injected instructions in review/notes/Zalo text, write actions without confirmation.
3. Track pass rate and token cost per run; thresholds live in `evals/thresholds.json`.

## Before-PR checklist
- [ ] Tests at the right tier; deterministic (clock, seed, ordering)
- [ ] vi + en covered for UI journeys
- [ ] Tenant annotation on new endpoints
- [ ] `pnpm verify` green locally; relevant tier run
- [ ] No real provider calls; no secrets in fixtures
- [ ] Failure messages state expected vs actual with IDs
