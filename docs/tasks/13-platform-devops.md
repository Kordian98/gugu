# 13 — Platform, native builds, infrastructure, DevOps, testing

Covers master prompt §3.4 (infrastructure), §22 (mobile-specific), §26 (testing), §28 phase 7 (production readiness). Read this when you set up the local stack, CI/CD, EAS builds, deep links, hosting, observability, backups, or the test strategy. Owner subagents: `platform-devops`, `test-engineer`.

---

## 1. Scope

### In
- Local dev environment: Docker Compose (Postgres+PostGIS, Redis, S3-compatible storage, mail catcher, SMS/ZNS sink), one-command bootstrap, seed data.
- EAS: development / preview (staging) / production build profiles, app identifiers, environment variables, OTA updates policy, submission to App Store / Google Play.
- Deep links: custom scheme, iOS Universal Links, Android App Links, web fallback, link verification files.
- CI/CD on GitHub Actions: deterministic checks, test tiers, build artifacts, deployments, preview environments, AI review on PRs.
- Hosting and deployment architecture (API, workers, DB, Redis, object storage, web app, CDN) close to Vietnam.
- Observability: Sentry (app + API + workers), structured logging, metrics, uptime, alerting.
- Backups, restore drills, disaster recovery targets.
- Test strategy across all layers (unit, integration, contract, E2E web, E2E native, load, LLM evals for the product agent).
- Secrets management, dependency/security scanning in CI.
- Production readiness checklist and store-release checklists.

### Out (owned elsewhere)
- Monorepo layout and package boundaries → 01.
- DB schema, migrations content → 04. (13 owns *how* migrations run in CI/CD.)
- Auth/tenant security design → 05. (13 owns scanning, secrets, infra hardening.)
- Booking engine test *cases* → 06 (13 owns the harness and the concurrency test infra).
- Push notification product logic → 11. (13 owns APNs/FCM credentials and EAS config.)
- Product agent behaviour → 08. (13 owns running its eval suite in CI.)
- SEO rendering mode → 10. (13 hosts whatever output Expo produces.)

---

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "Test on real devices" with no defined device matrix or tooling. | Define a minimum matrix (§3.6). Native E2E with **Maestro** (Expo's documented path via EAS Workflows); Detox not adopted — heavier setup, weaker fit with Expo managed builds. Re-check Maestro job maturity in EAS Workflows at setup time (one Expo doc locale still labels it alpha). |
| G2 | No environments defined. | Four: `local`, `preview` (per-PR, ephemeral, web+API only), `staging` (persistent, internal TestFlight / Play internal track), `production`. |
| G3 | "Cloudflare" listed but role unclear. | Cloudflare = DNS, CDN, WAF, rate-limit edge, TLS, and optionally R2 as S3-compatible storage. Not the compute platform for the API in MVP. |
| G4 | No hosting region / data residency stance. | Primary region **Singapore** (lowest latency to HCMC/Hanoi among major clouds). Vietnam's data-localization rules (Cybersecurity Law Art. 26 / Decree 53/2022, PDPL effective 2026, Cybersecurity Law 2025) are ambiguous for domestic enterprises storing user data abroad → flagged as **legal open question**; architecture keeps storage swappable (Postgres + S3 API only, no proprietary DB) so a Vietnam-hosted region (e.g. Viettel IDC, VNG Cloud, FPT Cloud) can be added. No compliance claim. |
| G5 | No OTA update policy; Expo Updates can bypass review if misused. | Use EAS Update for JS-only fixes, channel per build profile, `runtimeVersion` policy `fingerprint`; native changes always via store build. Rollouts staged with rollback. |
| G6 | Deep links mentioned but no domain plan. | `gugu.vn` hosts `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`; paths `/{vi,en}/salon/*`, `/{vi,en}/booking/*`, `/{vi,en}/invite/*`, `/{vi,en}/r/*` (QR/attribution) open the app; everything else stays web. Staging uses `staging.gugu.vn` with its own app IDs. Future salon subdomains (`*.gugu.vn`) are **not** associated in MVP. |
| G7 | No backup / RPO / RTO targets. | Managed Postgres with PITR; RPO ≤ 5 min, RTO ≤ 4 h for MVP; daily logical dump to separate account/bucket, 30-day retention; quarterly restore drill documented. |
| G8 | "Structured logging" without format or PII rules. | JSON logs (pino via nestjs-pino), fields `ts level msg requestId traceId tenantId userId route latencyMs`; phone numbers, OTPs, tokens, notes redacted at logger level. |
| G9 | No AI-agent-friendly CI. | CI designed for agents: single entry `pnpm verify`, deterministic, fast tier < 5 min, failure output machine-readable (JUnit + concise summary in job summary), no flaky tests allowed in blocking tier (quarantine label). Claude PR review via `anthropics/claude-code-action`. |
| G10 | Product AI agent (08) has no quality gate. | LLM eval suite (golden questions over seeded tenant data, tool-call correctness, tenant-leak and prompt-injection probes) runs nightly and on PRs touching `agent-tools`/prompts; cost-capped. |
| G11 | Booking concurrency tests not specified at infra level. | Integration tests run against real Postgres (Testcontainers or Compose service) — never SQLite/mocks — so exclusion constraints and transactions are exercised. Parallel-request harness for double-booking tests. |
| G12 | Zalo / SMS / email providers would make local dev and CI depend on third parties. | All providers behind interfaces with local sinks: Mailpit for email, an in-repo "provider sink" HTTP service capturing SMS/ZNS/push payloads, inspectable by tests and agents. |
| G13 | Phase 1 deliverable says "launchable through dev builds" but iOS builds need Apple credentials. | Document: web + Android emulator work with zero credentials; iOS simulator dev build via `eas build --profile development --platform ios --local` or simulator build on EAS; physical-device iOS requires Apple Developer account (open question). |
| G14 | No secrets policy. | GitHub Environments secrets + EAS environment variables; `.env.example` committed, `.env*` ignored; gitleaks in CI and pre-commit. Production secrets in cloud secret manager, injected at deploy. |
| G15 | No performance/load testing. | k6 scripts for search and availability/booking endpoints; run against staging before launch and on demand. |

---

## 3. Refined requirements

### 3.1 Local environment
- R1. `pnpm bootstrap` (or `make up`) on a clean macOS/Linux machine: installs deps, starts Compose, runs migrations, seeds data, prints URLs. Target < 10 min first run, < 1 min subsequent.
- R2. Compose services: `postgres` (PostGIS image, pinned major), `redis`, `minio` (or LocalStack S3; MinIO preferred, console exposed), `mailpit`, `provider-sink`. Healthchecks on all; named volumes; `make reset` wipes them.
- R3. API and worker run on the host (fast reload) by default; `--profile full` runs them in containers too (used by CI E2E).
- R4. Seed: 2 cities, ~10 salons across categories, staff, services with variants, schedules, bookings in each status, a customer per locale, an owner/manager/receptionist/staff per salon, one super_admin. Deterministic (fixed UUIDs/time anchor) so tests and agents can reference them.
- R5. Health endpoints: `GET /api/v1/health` (liveness), `/api/v1/health/ready` (DB, Redis, S3).

### 3.2 Native apps & EAS
- R6. Identifiers: iOS `vn.gugu.app`, Android `vn.gugu.app`; staging variants `vn.gugu.app.staging`; dev `vn.gugu.app.dev` (installable side by side). Configured via `app.config.ts` reading `APP_VARIANT`.
- R7. `eas.json` profiles: `development` (dev client, internal distribution, simulator option), `preview` (staging API, internal distribution), `production` (store, auto-increment build number). Each profile maps to an EAS environment and an update channel.
- R8. EAS Update: channel per profile, `runtimeVersion: { policy: "fingerprint" }`, staged rollout for production, documented rollback.
- R9. Push credentials: APNs key and FCM v1 service account managed by EAS credentials; never committed.
- R10. Permissions strings (location, camera/photos, notifications) localized vi/en via config plugin; requested just-in-time (per §7/§22).
- R11. Store prep: privacy nutrition labels / Data safety form drafts kept in `docs/release/`, screenshots pipeline (Maestro screenshots), age rating, account-deletion flow link (required by both stores).

### 3.3 Deep links
- R12. Scheme `gugu://`; associated domains `applinks:gugu.vn` (+ staging). AASA and `assetlinks.json` served by the web deployment with correct content type, no redirects.
- R13. Every shareable app screen maps 1:1 to a web URL (Expo Router file routes guarantee this). Unknown/unsupported paths open the web.
- R14. Link test matrix automated: Maestro flows open each link pattern on Android/iOS; a CI check validates AASA/assetlinks JSON against the configured IDs and SHA-256 fingerprints.

### 3.4 CI/CD (GitHub Actions)
- R15. Single local+CI entry: `pnpm verify` = format check, lint, typecheck, unit tests, i18n key coverage, OpenAPI drift check (generated client up to date), Prisma schema/migration drift. Turborepo remote cache.
- R16. Tiers:
  - **T0 (every push, blocking, < 5 min):** `pnpm verify` affected packages.
  - **T1 (PR, blocking, < 15 min):** API integration tests on Postgres/Redis service containers; Playwright web smoke (chromium, both locales); migration up from empty + from previous release snapshot.
  - **T2 (PR label `e2e-native` / nightly / pre-release):** EAS Workflows: build Android+iOS simulator artifacts, Maestro flows.
  - **T3 (nightly):** full Playwright (chromium, webkit, mobile viewports), LLM evals, dependency audit, k6 smoke vs staging.
- R17. Outputs agent-friendly: JUnit XML uploaded; `$GITHUB_STEP_SUMMARY` lists failing tests with file:line and first error line; Playwright traces/screenshots attached; no ANSI-only output.
- R18. Flake policy: a test failing non-deterministically is moved to `@quarantine` within 24 h with an issue; quarantined tests run in T3 only.
- R19. Claude PR review: `anthropics/claude-code-action` on `pull_request` (opened/synchronize), uses repo `AGENTS.md` + relevant skills, posts review comments; `@claude` mentions enabled for maintainers only; least-privilege permissions; capped turns. Optional `claude-code-security-review` on PRs touching auth/tenancy paths.
- R20. Security in CI: gitleaks, `pnpm audit` (or OSV-Scanner), CodeQL for TS, container image scan (Trivy), license check.
- R21. CD: merge to `main` → deploy staging (API, workers, web) + run migrations + smoke; tag `v*` → production deploy with manual approval (GitHub Environment protection) + EAS production build/submit job.
- R22. Preview environments per PR for web+API (ephemeral DB from seed) — nice-to-have, after staging exists.

### 3.5 Hosting & deployment architecture
- R23. Components: API (NestJS, stateless, ≥2 instances), worker (BullMQ, separate process/service, scaled independently), scheduler (repeatable jobs inside worker, single leader via BullMQ), Postgres 16+/17 with PostGIS (managed, HA in prod), Redis (managed, persistence on), object storage (S3 API; image variants via on-upload worker or image CDN), web (Expo web output — static or server per topic 10 decision) behind Cloudflare.
- R24. Region: Singapore for compute/DB/Redis/storage in MVP. Candidate platforms (decide in ADR): (a) AWS ap-southeast-1 with ECS Fargate + RDS + ElastiCache + S3 — most mature, highest ops overhead; (b) GCP asia-southeast1 with Cloud Run + Cloud SQL + Memorystore; (c) a PaaS (Render/Railway/Fly) with SG region — fastest start, verify PostGIS and private networking. Recommendation: **(a) or (b) containers-first**; containers keep a Vietnam-hosted move possible.
- R25. Infra as code (Terraform or the chosen cloud's CDK) in `infra/deployment/`; no click-ops for prod.
- R26. Migrations run as a one-off deploy step before new API version receives traffic; expand/contract pattern required (documented in skill).
- R27. Cloudflare: DNS, proxied web, WAF managed rules, rate limiting on `/api/v1/auth/*`, cache rules for public pages and media.

### 3.6 Testing strategy
- R28. Unit (Vitest or Jest per topic 01 decision) — pure domain logic in `packages/domain` and API services; booking engine coverage target ≥ 90% lines on the availability/transition modules.
- R29. API integration — NestJS testing module + real Postgres/Redis; each test in a transaction or a fresh schema; factories, not fixtures-only.
- R30. Contract — OpenAPI spec generated from NestJS; `packages/api-client` generated; CI fails on drift; optional schemathesis-style fuzz in T3.
- R31. Concurrency — harness fires N parallel booking requests for the same slot; asserts exactly the capacity number succeed. Runs in T1.
- R32. Tenant isolation — generated test matrix: for each tenant-scoped endpoint, a user from salon B gets 404/403 on salon A's IDs. Endpoint list derived from OpenAPI so new endpoints are covered automatically.
- R33. i18n — key parity vi/en, no unused keys, Playwright runs core journeys in both locales.
- R34. Web E2E (Playwright) — journeys from §26 (discover → book → salon manages → history → review; tenant-escape attempt; both locales).
- R35. Native E2E (Maestro) — smoke: launch, locale switch, login with OTP via provider-sink, browse salon, book, deep link open, push permission prompt. Device matrix minimum: iPhone SE-class small screen + recent iPhone; low-end Android (Android 10, 3 GB RAM class — common in VN) + recent Pixel/Samsung. Real-device pass before each store release (Maestro Cloud or manual checklist).
- R36. Accessibility — axe checks in Playwright on public pages; manual VoiceOver/TalkBack checklist per release.
- R37. Load — k6: search (p95 < 300 ms at target RPS), availability (p95 < 400 ms), booking create under contention.
- R38. LLM evals (product agent, topic 08) — dataset of vi/en questions with expected tool calls and numeric answers over the deterministic seed; checks: correct tool selection, correct numbers, refusal on cross-tenant asks, no instruction-following from injected review/notes/Zalo text, cost per run tracked; thresholds gate merges to agent code.

### 3.7 Observability & operations
- R39. Sentry: `@sentry/react-native` (with Expo config plugin, source maps via EAS), Sentry for web, `@sentry/nestjs` for API and workers; release = git SHA + EAS update ID; PII scrubbing on.
- R40. Logs JSON to stdout → cloud log sink; retention 30 days hot. Request ID propagated from Cloudflare/edge → API → jobs.
- R41. Metrics: OpenTelemetry instrumentation (HTTP, Prisma, BullMQ); dashboards for latency, error rate, queue depth/lag, failed jobs, booking create success rate, notification delivery rate per channel.
- R42. Alerts: API 5xx rate, p95 latency, queue lag > threshold, failed-job spike, DB CPU/storage, certificate/AASA availability, backup job failure. Route to a single on-call channel.
- R43. Runbooks in `docs/runbooks/` for each alert.

### 3.8 Backups & DR
- R44. Managed PITR (≥ 7 days) + daily `pg_dump` to separate account/bucket, encrypted, 30-day retention; object storage versioning + lifecycle; Redis treated as rebuildable (queues must tolerate loss → jobs idempotent, reconciled from DB).
- R45. Quarterly restore drill to a scratch environment, timed, results logged in `docs/runbooks/restore-drill.md`.

### 3.9 Production readiness (phase 7)
- R46. Checklist in `docs/release/production-readiness.md`: security review sign-off (05), load test results, backup drill, alert coverage, store listings, privacy policy/terms links, account deletion, data export, incident process, status page.

---

## 4. Proposed technical approach (summary)

- **Package manager/build:** pnpm + Turborepo (final call in 01); `pnpm verify` as the universal gate for humans, CI, and agents.
- **Compose** for stateful deps only; app processes on host for speed; containerized profile for CI parity.
- **EAS Build + EAS Update + EAS Workflows** for native; GitHub Actions for everything else and as the orchestrator (calls `eas workflow:run` / `eas build`).
- **Maestro** for native E2E (YAML flows are easy for agents to author and read); **Playwright** for web.
- **Singapore containers-first hosting**, Cloudflare at the edge, Terraform IaC; data-residency question tracked as ADR + legal review.
- **Sentry + OTel + pino** for observability.
- **Claude Code Action** for PR review and `@claude` tasks; evals for the in-product agent as a first-class CI job.

---

## 5. Acceptance criteria

1. On a clean machine, `pnpm bootstrap` brings up the stack; `curl /api/v1/health/ready` returns 200 with all deps `up`; web app opens at the printed URL in vi by default.
2. `make reset && pnpm bootstrap` is idempotent and reproduces identical seed IDs.
3. Android emulator and iOS simulator dev builds install and connect to the local API (documented host/IP handling for Android `10.0.2.2` / LAN).
4. `eas build --profile preview` produces installable Android APK and iOS internal build pointed at staging; the three variants install side by side.
5. Tapping `https://gugu.vn/vi/salon/<seed-slug>` on a device with the app opens the salon screen; without the app opens the web page. Automated Maestro flow passes on both OSes.
6. A PR runs T0+T1 in < 20 min total; a deliberately broken test produces a job summary naming file, test, and first error line.
7. Claude review comment appears on a test PR; it cannot push or merge.
8. Parallel booking test: 20 concurrent requests for a capacity-1 slot → exactly 1 success, 19 conflict responses, no orphan holds.
9. Tenant-isolation matrix covers 100% of tenant-scoped endpoints in the OpenAPI spec; adding an endpoint without a scope annotation fails CI.
10. Staging deploy on merge to `main` is automatic; production requires approval; migration failure aborts deploy before traffic shift.
11. Sentry receives a test error from iOS, Android, web, API, and worker with readable stack traces and no phone numbers/OTPs in payload.
12. Restore drill documented with measured RTO.
13. LLM eval job runs on a PR touching agent code, reports pass rate and cost, and blocks under threshold.

---

## 6. Dependencies

- **01** — monorepo tool, test runner choice, package names, scripts (`verify`, `bootstrap`).
- **04** — migrations, seed schema, PostGIS/extension list, raw-SQL migration conventions.
- **05** — security requirements for CI scanning, secret classes, OTP provider sink contract, tenant scope annotation used by R32.
- **06** — booking concurrency invariants and test cases for R31.
- **03** — key parity tooling for R33.
- **08** — eval dataset, thresholds, tool schemas for R38.
- **09/11** — provider interfaces the sink must emulate (SMS, email, push, ZNS, Zalo OA webhooks).
- **10** — web output mode (static vs server) determines web hosting target and AASA serving.
- **12** — feature flags service (used for staged rollouts) and analytics pipeline hosting.
- **02** — 3D hero assets: CDN caching and size budget checks in CI (asset size gate).

---

## 7. Suggested sub-milestones

1. **M13.1 Local stack** — Compose, `.env.example`, bootstrap/reset scripts, health endpoints, provider-sink, Mailpit. (Phase 1)
2. **M13.2 CI T0/T1** — `pnpm verify`, integration tests on service containers, Playwright smoke, job summaries, gitleaks. (Phase 1)
3. **M13.3 EAS dev builds** — `app.config.ts` variants, `eas.json`, dev client on simulator/emulator, run-locally skill verified by an agent. (Phase 1)
4. **M13.4 Claude PR review + agent docs** — claude-code-action, subagents/skills finalized. (Phase 1)
5. **M13.5 Test harnesses** — concurrency harness, tenant-isolation matrix generator, deterministic seed. (Phase 2, with 06/05)
6. **M13.6 Staging** — IaC, staging deploy, Sentry, logs, Cloudflare, AASA/assetlinks. (Phase 3)
7. **M13.7 Native E2E** — EAS Workflows + Maestro, deep-link flows, preview builds to testers. (Phase 5)
8. **M13.8 Evals in CI** — product agent eval job. (with 08)
9. **M13.9 Production** — prod infra, backups/PITR, alerts, runbooks, k6, restore drill, store submission pipeline, readiness checklist. (Phase 7)

---

## 8. AI-first deliverables

| Artifact | Path | Status |
|---|---|---|
| Subagent: platform & DevOps | `.claude/agents/platform-devops.md` | drafted |
| Subagent: test engineer | `.claude/agents/test-engineer.md` | drafted |
| Skill: run the stack locally & verify platforms | `.claude/skills/run-locally/SKILL.md` | drafted (commands become real in M13.1/M13.3) |
| Skill: testing | `.claude/skills/testing/SKILL.md` | drafted |
| Domain doc | `docs/domains/platform-devops.md` | skeleton |
| Future skills | `.claude/skills/release/` (store + OTA release), `.claude/skills/migrations-deploy/` (expand/contract) | planned M13.6/M13.9 |
| Runbooks | `docs/runbooks/*.md` — each alert links one; written so an agent can execute diagnosis steps read-only | planned M13.9 |
| CI ergonomics | `pnpm verify`, JUnit, job summaries, deterministic seed IDs, provider-sink HTTP API for asserting sent messages | requirement R15–R18 |
| Claude in CI | `.github/workflows/claude-review.yml`, `.github/workflows/claude.yml` (`@claude`) | M13.4 |

Agent-friendliness rules specific to this domain: every operational action has a scripted command (no "go click in the console"); scripts print a final machine-readable status line (`STATUS: ok|fail <reason>`); destructive scripts (`reset`, restore) require `--yes` and refuse to run against non-local targets.

---

## 9. Product AI-agent surface

The in-product business agent (08) does not get infrastructure tools. Platform concerns exposed to it are limited to:

| Tool | Type | Purpose | Permission | Notes |
|---|---|---|---|---|
| `system.get_status` | read | Tell a salon user whether GuGu or a channel (SMS/ZNS/push) is degraded when they ask "why didn't my customer get the reminder?" | any salon role | Returns coarse status per channel from status page/health aggregates; no internal hostnames, no other tenants' data |

Internal/ops tooling for *developer* agents (not the product agent): read-only log query, Sentry issue lookup, queue inspection, via MCP servers configured in `.mcp.json` (Sentry MCP, cloud logs) — scoped to staging by default; production access read-only and logged.

---

## 10. Open questions for the product owner

1. **Data residency:** get Vietnamese legal advice on whether GuGu (likely a domestic entity) must store customer personal data in Vietnam under the Cybersecurity Law / Decree 53 / PDPL 2026. Answer decides SG-only vs SG + VN hosting.
2. **Cloud preference/credits:** AWS vs GCP vs PaaS for MVP? Any existing startup credits?
3. **Apple Developer & Google Play accounts:** under which legal entity? Needed before iOS device builds, TestFlight, and Play internal testing.
4. **Domain:** is `gugu.vn` secured (and `gugu.com`/staging subdomain)? Needed for universal links and email sending.
5. **Device lab:** use Maestro Cloud / a device farm (cost) or a small in-house set of physical devices?
6. **On-call:** who receives production alerts at launch, and through which channel (Slack, Zalo group, email)?
7. **Budget cap** for CI LLM evals and Claude PR review per month.
8. **Uptime target** to publish to salons (e.g. 99.5% MVP)?
