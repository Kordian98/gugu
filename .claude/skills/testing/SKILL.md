---
name: testing
description: How GuGu tests are organised, written, and run — test tiers, the local merge gate (pnpm verify / pnpm gate, reviewer verdict files, merge-to-main), unit/integration/contract/E2E/native/load/LLM-eval conventions, the booking concurrency harness, the tenant-isolation matrix, deterministic seed and clock, provider-sink assertions. Use before writing or fixing any test, when the gate fails, when reviewing a branch, or when deciding which tier a test belongs to.
---

# Testing GuGu

> Status: target contract from `docs/tasks/13-platform-devops.md` §3.4, §3.7. Update paths/commands as they land. There is **no git remote / CI yet** — everything below runs locally.

## When to use
Writing tests, diagnosing a red gate, reviewing a branch before merge, adding an endpoint (tenant matrix), touching booking logic (concurrency), touching the product AI agent (evals).

## Invariants (MUST / MUST NOT)
- MUST pick the cheapest tier that proves the behaviour: unit → integration → E2E.
- MUST use real Postgres+PostGIS and Valkey/Redis for integration tests. MUST NOT mock the DB for booking, tenancy, search.
- MUST freeze time (injected `Clock` / fake timers) and use seed IDs; never depend on "now" or ordering.
- Times: assert in UTC; render checks in `Asia/Ho_Chi_Minh`; include one DST timezone (e.g. `Europe/Warsaw`) in availability tests.
- MUST run user-facing journeys in `vi` and `en`.
- MUST NOT hit real SMS / `zalo_template` (ZBS Template Message, formerly ZNS) / Zalo OA / email / push; assert via provider-sink (`GET :4010/messages`) and Mailpit API.
- MUST NOT leave flaky tests in `verify`/`gate` — tag `@quarantine` + note in `docs/runbooks/quarantine.md`.
- Every tenant-scoped endpoint MUST carry the tenant-scope annotation so the isolation matrix picks it up.
- MUST NOT bypass hooks (`--no-verify`) or commit on `main`.

## Tiers (local now; same scripts in CI later)

| Command | Contents | Budget |
|---|---|---|
| `pnpm verify` (T0) | format, lint, typecheck, unit, i18n parity, OpenAPI drift, Prisma drift, gitleaks | < 5 min |
| `pnpm gate` (T0+T1) | verify + API integration (Compose Postgres/Valkey), concurrency harness, tenant matrix, Playwright smoke (chromium, vi+en), migrations from empty + last release tag, LLM evals if agent paths changed | < 15 min |
| `pnpm gate:native` (T2) | Maestro flows on local simulator/emulator (later: EAS Workflows) | — |
| `pnpm gate:nightly` (T3) | full Playwright (chromium/webkit/mobile viewports), full evals, audits, quarantined tests, k6 vs staging | — |

Output: JUnit in `reports/`, `reports/gate-summary.md` (failing test, file:line, first error line), last line `STATUS: ok|fail <reason>`.

## Commands
- Unit for one package: `pnpm --filter <pkg> test`
- API integration: `pnpm --filter api test:int` (needs `docker compose up -d --wait`)
- Web E2E: `pnpm --filter e2e-web exec playwright test [--grep @smoke]`
- Native E2E: `maestro test e2e/native/<flow>.yaml`
- Load: `k6 run e2e/load/<script>.js -e BASE_URL=...`
- Agent evals: `pnpm --filter evals run [--suite <name>]`

## Layout (target)
- Unit: colocated `*.test.ts`. API integration: `apps/api/test/integration/**`, factories `apps/api/test/factories/`.
- Web E2E: `e2e/web/` (page objects per area). Native: `e2e/native/*.yaml` — select by `testID`, never by translated text.
- Load: `e2e/load/`. Evals: `evals/` (`datasets/*.jsonl`, `thresholds.json`).

## Local merge gate

### Branches and worktrees
- One branch per task: `agent/<agent-slug>/<task-id>-<short>`.
- One worktree per agent: `git worktree add ../gugu-worktrees/<task-id> -b <branch> main`. Never edit another agent's worktree.

### Required reviewers (by changed paths)
| Paths changed | Reviewers |
|---|---|
| any | owning domain agent + `test-engineer` |
| `apps/api/**`, auth, `agent-tools`, Zalo, env/config, logging, `infra/**` | `security-reviewer` |
| `apps/app/**`, `packages/design-system/**` | `design-reviewer`, `localization` |
| workspace config, package boundaries, `packages/contracts/**` | `architecture` |
| product agent prompts/tools, `evals/**` | `ai-agent` |

### Procedure: review a branch (any reviewer)
1. `git -C <your-worktree> checkout <branch>`; note `SHA=$(git rev-parse HEAD)`.
2. Review the diff `git diff main...$SHA`; `test-engineer` also runs `pnpm gate`.
3. Write `.git/gugu-reviews/<branch>/<reviewer>.json` (in the main repo's `.git`, find it with `git rev-parse --git-common-dir`):
   `{ "reviewer": "<slug>", "sha": "<SHA>", "verdict": "approve" | "changes", "findings": [...], "ts": "<ISO>" }`
4. A new commit on the branch invalidates all verdicts — reviewers re-run on the new SHA.

### Procedure: merge
1. `pnpm merge-to-main <branch>` — it rebases on `main`, runs `pnpm gate`, checks every required verdict is `approve` for the current HEAD SHA, merges `--no-ff` with `GUGU_MERGE_GATE=1`, writes a repo bundle backup, removes the worktree.
2. If it prints `STATUS: fail`, `main` is unchanged — fix and repeat. Rebasing changes the SHA, so the script re-requests verdicts if the rebase was non-trivial.

## Procedure: add an API endpoint test
1. Annotate the controller with the tenant scope (topic 05) — cross-tenant cases are generated.
2. Integration tests: happy path, validation error (localized key), unauthenticated, wrong role, cross-tenant (auto), not-found.
3. `pnpm --filter api-client generate` so OpenAPI drift passes.

## Procedure: booking engine changes
1. Table-driven unit tests of the availability function (hours, breaks, time off, holidays, buffers, variants, multi-service, resources, capacity).
2. Integration tests for create/reschedule/cancel against Postgres, incl. the exclusion constraint.
3. Concurrency harness: N parallel creates for one slot → exactly `capacity` succeed, rest get the conflict code, no orphan holds after TTL.
4. Every disallowed state transition returns an error and writes no history row.

## Procedure: diagnose a red gate
1. Read `reports/gate-summary.md`; open JUnit / Playwright traces in `reports/`.
2. Re-run the single failing command from the summary with the same seed.
3. Non-deterministic after 3 runs → quarantine + note, then fix root cause.

## Procedure: LLM evals for the product agent
1. Case = locale, salon role, question, expected tool calls (name + key args), expected facts (seed numbers), forbidden behaviours.
2. Probes: another salon's data, injected instructions in review/notes/Zalo text, write actions without confirmation.
3. Track pass rate and token cost; thresholds in `evals/thresholds.json`.

## Later: when a git remote exists
The same `verify`/`gate` scripts run in GitHub Actions as required checks; `anthropics/claude-code-action` runs the reviewer prompts on PRs. See spec §3.4.B.

## Before-merge checklist
- [ ] Tests at the right tier; deterministic
- [ ] vi + en covered for UI journeys
- [ ] Tenant annotation on new endpoints
- [ ] `pnpm gate` → `STATUS: ok`
- [ ] Required reviewer verdicts approve the current HEAD SHA
- [ ] No real provider calls; no secrets in fixtures
