# 13 — Platform, native builds, infrastructure, DevOps, testing

Covers master prompt §3.4 (infrastructure), §22 (mobile-specific), §26 (testing), §28 phase 7 (production readiness). Read this when you set up the local stack, the merge gate, EAS builds, deep links, AWS hosting, observability, backups, or the test strategy. Owner subagents: `platform-devops`, `test-engineer`.

**Product-owner decisions applied (2026-11-02, tracker q01/q02/q04/q05/q08/q10/q45/q56–q59; roadmap X2/X12/X14/X16):**
- **Localhost only until there is an app** (q57, q59): no AWS account, no staging, no cloud backups, no git remote now. The AWS design in §3.5 is a **later milestone (13-M13.6)**, kept so we don't redesign it then.
- Hosting when we deploy: **AWS ap-southeast-1**, **Cloudflare in front** (q02, q10, q56).
- **No Vietnamese entity**; accounts (Apple, Google Play, EAS, domain) owned by the owner's Polish company; `gugu.vn` secured (q01, q05, q58). Legal review deferred entirely (q04).
- **No on-call** (q45); no device farm; no monthly budget caps tracked.
- **No real SMS provider**: provider-sink emulates email, push, Zalo (`zalo_template`, `zalo_oa`) and an SMS mock.
- **Analytics are built in-house** (no PostHog or other hosted analytics to run).
- **Pre-release libraries allowed** (q08) — pin exact versions and note them in the ADR.
- **No git remote**: agents merge to local `main` after a green local gate and reviewer-agent approval. **No repo-bundle backups** in the near-term plan (q59).
- X2: ZNS is now **ZBS Template Message**, channel id `zalo_template` ("ZNS" only as a historical alias).

---

## 1. Scope

### In
- Local dev environment: Docker Compose (Postgres+PostGIS, Valkey, S3-compatible storage, mail catcher, provider sink for email / push / `zalo_template` / `zalo_oa` / SMS mock), one-command bootstrap, deterministic seed.
- **Local-only delivery workflow** (now): branches/worktrees per agent, git hooks, `pnpm verify` gate, reviewer agents as merge gate, merge to local `main`.
- GitHub Actions + Claude Code Action design (**later**, when a remote exists).
- EAS: development / preview (staging) / production profiles, app identifiers, EAS environment variables, OTA policy, store submission.
- Deep links: custom scheme, iOS Universal Links, Android App Links, web fallback, verification files.
- AWS ap-southeast-1 target architecture, IaC, deployments, cost envelope — **design only; built later**.
- Observability: local structured logging + Sentry dev setup now; cloud metrics/alerts, backups and DR later.
- Test strategy across all layers incl. LLM evals for the product agent.
- Secrets management, dependency/security scanning.
- Production readiness and store-release checklists.

### Out (owned elsewhere)
- Monorepo layout, package boundaries, test runner choice → 01.
- DB schema and migration content → 04 (13 owns *how* migrations run in deploys).
- Auth/tenant security design → 05 (13 owns scanning, secrets, infra hardening).
- Booking engine test *cases* → 06 (13 owns the concurrency harness).
- Notification product logic → 11; Zalo specifics → 09 (13 owns APNs/FCM credentials, EAS config, the provider sink).
- Product agent behaviour → 08 (13 owns running its evals in the gate).
- Web rendering mode (SSR vs static) → 10 / spike S1 (13 hosts whichever wins).

---

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "Test on real devices" with no device matrix or tooling. | Minimum matrix in §3.7. Native E2E with **Maestro** (Expo's documented path; runs locally now, via EAS Workflows later). Detox not adopted. Re-check the Maestro job's maturity in EAS Workflows at setup (one Expo doc locale still calls it alpha). |
| G2 | No environments defined. | **Now: `local` only.** Later: `staging` (internal TestFlight / Play internal track) and `production`; per-PR previews only after a remote + CI exist. |
| G3 | "Cloudflare" listed, role unclear; AWS chosen for hosting. | Decided (q56): **Cloudflare in front** = DNS, WAF, rate limiting, edge cache for HTML/API (`gugu.vn`, `api.gugu.vn`). **CloudFront + OAC** only for private-bucket media (`media.gugu.vn`). Applies when we deploy. |
| G4 | No hosting region / data residency stance. | **AWS ap-southeast-1** when we deploy. No VN entity; legal review deferred by the owner (q04) — no compliance claim. Portability kept (Postgres + S3 API + containers) so residency can be revisited. Hanoi Local Zone noted as a later option (§3.5). |
| G5 | No OTA policy; misuse can bypass store review. | EAS Update for JS-only fixes, channel per profile, `runtimeVersion: { policy: "fingerprint" }`; native changes always via store build; staged rollout + rollback. |
| G6 | Deep links with no domain plan. | `gugu.vn` serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`; paths `/{vi,en}/salon/*`, `/booking/*`, `/invite/*`, `/r/*` open the app; others stay web. Staging uses `staging.gugu.vn` + staging app IDs. Salon subdomains not associated in MVP. |
| G7 | No RPO/RTO. | Later (with AWS): RDS PITR + cross-account snapshot copies; RPO ≤ 5 min, RTO ≤ 4 h; restore drill before launch. Nothing now — local data is disposable seed data. |
| G8 | "Structured logging" without format/PII rules. | JSON logs (pino via nestjs-pino), fields `ts level msg requestId traceId tenantId userId route latencyMs`; phones, OTPs, tokens, internal notes redacted in the logger. |
| G9 | No AI-agent-friendly delivery workflow; **no git remote exists**. | Local gate now (§3.4.A): worktree per task, git hooks, `pnpm verify` + `pnpm gate`, reviewer agents record verdicts bound to the commit SHA, `pnpm merge-to-main` is the only path to `main`. GitHub Actions + `anthropics/claude-code-action` is the documented *later* step (§3.4.B). |
| G10 | Product AI agent (08) has no quality gate. | LLM eval suite runs in `pnpm gate` when agent paths change, and nightly once CI exists; cost-capped. |
| G11 | Booking concurrency tests unspecified at infra level. | Integration tests on real Postgres (Compose/Testcontainers), never SQLite/mocks; parallel-request harness. |
| G12 | Providers would make dev/tests depend on third parties. | Provider interfaces with local sinks: Mailpit for email, an in-repo **provider-sink** capturing push, `zalo_template` (ZBS Template Message), Zalo OA messages/webhooks, and an **SMS mock** (no real SMS provider is planned). |
| G13 | iOS builds need Apple credentials. | Web + Android emulator + iOS simulator work with zero credentials (`expo run:*`). Physical iOS / TestFlight use the Apple Developer account of the owner's Polish company (q05). |
| G14 | No secrets policy. | `.env.example` committed, `.env*` ignored, gitleaks in pre-commit and gate; EAS environment variables for app build secrets. Later: AWS Secrets Manager + SSM Parameter Store. |
| G15 | No load testing. | k6 scripts for search, availability, booking contention; run locally now, against staging later. |
| G16 | No remote = single copy of the repo. | Owner accepted the risk for now (q59): no repo-bundle backups in the near-term plan. Revisit when a remote or AWS exists. |
| G17 | ZNS naming outdated (X2). | Use "ZBS Template Message", channel id `zalo_template` everywhere in this topic. |
| G18 | Analytics hosting unspecified. | In-house analytics (topic 12): events go to our own API/Postgres; no third-party analytics service to run locally or later. |

---

## 3. Refined requirements

### 3.1 Local environment
- R1. `pnpm bootstrap` on a clean macOS/Linux machine: install deps, `docker compose up -d --wait`, migrate, seed, print URLs. < 10 min first run, < 1 min after.
- R2. Compose services: `postgres` (PostGIS image, same major as the future RDS target), `valkey` (same major as the future ElastiCache target), `minio`, `mailpit`, `provider-sink` (push, `zalo_template`, `zalo_oa`, SMS mock). Healthchecks, named volumes; `pnpm reset --yes` wipes local volumes only.
- R3. API/worker/Expo run on host by default; `--profile full` runs API+worker in containers (used by `pnpm gate` E2E for parity with ECS images).
- R4. Deterministic seed: 2 cities, ~10 salons, staff, services/variants, schedules, bookings in every status, a customer per locale, owner/manager/receptionist/staff per salon, one super_admin. Fixed UUIDs, slugs, phones, and a fixed time anchor.
- R5. `GET /api/v1/health` (liveness), `/api/v1/health/ready` (DB, Redis, S3).

### 3.2 Native apps & EAS
- R6. IDs: `vn.gugu.app`, `vn.gugu.app.staging`, `vn.gugu.app.dev` via `app.config.ts` + `APP_VARIANT`.
- R7. `eas.json` profiles `development` (dev client, simulator option; now), `preview` (internal distribution; points at a LAN/tunnel API until staging exists), `production` (store, auto-increment; later). Each maps to an EAS environment and update channel. EAS cloud builds work from a local repo (no remote needed); `eas build --local` as fallback.
- R8. EAS Update: fingerprint runtime version, staged production rollout, documented rollback.
- R9. APNs key and FCM v1 credentials managed by EAS; never committed.
- R10. Permission strings localized vi/en via config plugin; requested just-in-time.
- R11. Store prep in `docs/release/`: privacy labels / Data safety drafts, Maestro screenshot flows, age rating, account-deletion link.

### 3.3 Deep links
- R12. Scheme `gugu://`; associated domains `applinks:gugu.vn` (+ staging). AASA and `assetlinks.json` served by the web service with correct content type, no redirects, excluded from Cloudflare challenges.
- R13. Every shareable screen maps 1:1 to a web URL (Expo Router file routes).
- R14. Automated: Maestro flows open each link pattern; a gate check validates AASA/assetlinks against configured IDs and signing fingerprints.

### 3.4 Delivery workflow

#### 3.4.A Now — local-only (no git remote)
- R15. **Gate commands.** `pnpm verify` (T0: format, lint, typecheck, unit, i18n parity, OpenAPI drift, Prisma drift, gitleaks) and `pnpm gate` (T0 + T1: API integration on Compose Postgres/Valkey, concurrency harness, tenant-isolation matrix, Playwright smoke vi+en, migrations from empty + from last release tag, LLM evals if agent paths changed). Turborepo local cache. Output: JUnit to `reports/`, and `reports/gate-summary.md` listing failing test, file:line, first error line. Final line `STATUS: ok|fail <reason>`.
- R16. **Branch per task, worktree per agent.** Branch name `agent/<agent-slug>/<task-id>-<short>` (humans: `feat/…`, `fix/…`). Each agent works in `git worktree add ../gugu-worktrees/<task-id> -b <branch> main`, so parallel agents never share a working tree. Worktrees removed after merge.
- R17. **Git hooks** (managed by lefthook, versioned in repo, installed by `pnpm bootstrap`):
  - `pre-commit`: block commits on `main` unless `GUGU_MERGE_GATE=1` (set only by the merge script); format + lint staged files; `gitleaks protect --staged`.
  - `commit-msg`: Conventional Commits; agent commits include the `Co-Authored-By` trailer from the session instructions.
  - `pre-push`: no-op until a remote exists, then runs `pnpm verify`.
- R18. **Reviewer agents are the merge gate.** Required reviewers are selected by changed paths (table in the `testing` skill / domain doc):
  - always: the owning domain agent (self-check) + `test-engineer`;
  - `apps/api/**`, auth, agent-tools, Zalo, env/config, logging → `security-reviewer`;
  - `apps/app/**`, `packages/design-system/**` → `design-reviewer` + `localization`;
  - workspace config, package boundaries, contracts → `architecture`;
  - product agent prompts/tools → `ai-agent`.
  Each reviewer writes `.git/gugu-reviews/<branch>/<reviewer>.json` = `{ reviewer, sha, verdict: "approve"|"changes", findings[], ts }`. A verdict is valid only for the exact branch HEAD SHA it reviewed.
- R19. **`pnpm merge-to-main <branch>`** (only way onto `main`): clean tree check → rebase branch on `main` → `pnpm gate` in the branch worktree → verify every required reviewer approved the current HEAD SHA → `GUGU_MERGE_GATE=1 git merge --no-ff` → remove worktree. Any failure leaves `main` untouched and prints why.
- R20. Flake policy: a non-deterministic test goes to `@quarantine` with a note in `docs/runbooks/quarantine.md`; quarantined tests run only in `pnpm gate:nightly`.
- R21. *(Removed per q59 — no repo-bundle backups now.)*
- R22. **No deploys now.** Later (13-M13.6): `pnpm deploy:staging` from clean local `main` with a green gate; `pnpm deploy:prod` needs a human-typed confirmation (agents never supply it) and a `vX.Y.Z` tag.

#### 3.4.B Later — when a git remote exists (GitHub)
- R23. Push `main` + tags; branch protection on `main`: required checks = `verify`, `gate`; required review.
- R24. GitHub Actions tiers: T0 every push (< 5 min), T1 every PR (< 15 min, service containers), T2 label `e2e-native`/nightly (EAS Workflows + Maestro), T3 nightly (full Playwright, evals, audits, k6 vs staging). Same commands as local — workflows only call `pnpm verify` / `pnpm gate`.
- R25. `anthropics/claude-code-action` for PR review and maintainer-only `@claude`; least-privilege permissions (`id-token: write`, `actions: read`), capped turns; optional `claude-code-security-review` on auth/tenancy paths. Local reviewer agents remain the definition of review; the action runs the same agent prompts.
- R26. CD: merge to `main` → staging deploy via GitHub OIDC → AWS role (no long-lived keys); tag `v*` → production with environment approval + EAS production build/submit.
- R27. CodeQL, OSV-Scanner/`pnpm audit`, Trivy image scan, license check; per-PR preview environments optional.

### 3.5 AWS ap-southeast-1 target architecture — LATER (13-M13.6, when there is an app to deploy)

> Not built now (q57). Kept as the agreed target so local choices (Postgres+PostGIS, Valkey, S3 API, containers) stay compatible.

**Is AWS a weak choice? No.** It is a strong fit: Singapore is the closest major region to Vietnam (typically ~30–50 ms RTT to HCMC/Hanoi), every managed service we need exists there, AWS opened a **Hanoi Local Zone** (GA June 2026, extension of ap-southeast-1) giving a future path to in-country compute, and AWS Activate credits are common for startups. The costs: more ops surface and a higher baseline bill than a PaaS — mitigated by CDK and a deliberately small footprint.

| Option | Latency to VN | Fit for our stack | Ops effort | MVP cost | Verdict |
|---|---|---|---|---|---|
| **AWS ap-southeast-1** | ~30–50 ms; Hanoi Local Zone later | RDS PostGIS + btree_gist, ElastiCache Valkey, S3, SES, Fargate — all native | medium (CDK) | ~$450–600/mo prod + ~$150 staging | **Chosen** |
| GCP asia-southeast1 (SG) | similar | Cloud Run great for API/SSR; Cloud SQL has PostGIS; Memorystore Valkey | low–medium | similar | Good alternative, no advantage that outweighs the PO's AWS lean |
| PaaS (Render / Railway / Fly, SG) | similar | Fast start; PostGIS/HA/private networking/backups vary | low | lower | Weaker for HA Postgres, compliance, and growth |
| Vietnamese clouds (VNG, Viettel IDC, FPT) | lowest | Fewer managed services (Redis/queues/email), weaker tooling | high | varies | Keep as residency fallback only |

**Hanoi Local Zone relevance:** offers EC2/ECS/ALB/EBS close to users but **not RDS/ElastiCache** (per current reports — verify the service list before use). Not used in MVP: our latency budget is met from Singapore and the DB must stay in-region anyway, so it does not solve residency on its own. Revisit if (a) legal review requires in-country processing or (b) measured p95 from Hanoi misses targets.

**Components**

| Concern | Choice | Why / notes |
|---|---|---|
| Compute: API, workers, Expo web server | **ECS on Fargate** (3 services: `api`, `worker`, `web`), ARM64/Graviton, behind one ALB (host/path routing) | Long-running NestJS + BullMQ workers need persistent processes and Redis connections → **not Lambda** (cold starts, connection churn, 15-min cap). **App Runner closed to new customers since 2026-04-30** → excluded. **ECS Express Mode** (AWS's App Runner successor) is acceptable if it supports our ALB/WAF/secrets needs at implementation time; default is standard ECS via CDK `ApplicationLoadBalancedFargateService`. If spike S1 picks static web output, `web` becomes S3 + CloudFront and the service is dropped. |
| Sizing (prod start) | `api` 2×(0.5 vCPU, 1 GB), `worker` 1×(0.5, 1 GB), `web` 2×(0.5, 1 GB); target-tracking autoscaling on CPU/req count; worker scales on queue depth metric | Small, horizontally scalable |
| Database | **RDS for PostgreSQL 17** (latest supported major at build time), `db.t4g.medium` Multi-AZ, gp3 50 GB autoscaling, PITR 14 days, Performance Insights; extensions `postgis`, `btree_gist`, `pg_trgm`, `unaccent`, `citext` (all supported on RDS — confirm versions in `rds.extensions`) | Exclusion constraints (06), geo search (10). RDS Proxy later if connection count grows. Aurora not needed at MVP. |
| Queue / cache | **ElastiCache for Valkey, node-based** `cache.t4g.small` primary + replica, cluster mode **disabled**, `maxmemory-policy noeviction`, TLS + AUTH | BullMQ officially supports Valkey; serverless ElastiCache forces cluster mode (hash-tag discipline) and limits engine settings → node-based is simpler and predictable. Separate logical DB/prefix for cache vs queues; move cache to its own node if eviction is needed. |
| Object storage | **S3** private buckets: `media` (versioned, lifecycle to IA), `media-variants`, `backups`; uploads via presigned PUT (04); image variants generated by worker | Media delivered via **CloudFront + Origin Access Control** at `media.gugu.vn` (CloudFront has VN edge locations). |
| Edge / CDN / WAF | **Cloudflare** (decided, q56): DNS for `gugu.vn`, proxy + WAF + rate limits on `/api/v1/auth/*`, cache for public pages → ALB (origin locked to Cloudflare IPs + secret header). | Cheaper WAF/rate limiting than AWS WAF. |
| Email | **Amazon SES** (ap-southeast-1), DKIM/SPF/DMARC on `gugu.vn`, configuration set → SNS for bounces/complaints | Request production access early (sandbox by default). |
| Secrets & config | **Secrets Manager** (RDS creds with rotation, provider API keys, JWT keys) + **SSM Parameter Store** (non-secret config); injected into ECS task definitions | No secrets in images or env files. |
| Observability | **Sentry** (app, web, API, worker: errors + performance); **CloudWatch Logs** (JSON, 30-day retention) + Container Insights + alarms → email to the owner (no on-call rota, q45); OpenTelemetry via ADOT later if needed | Minimal moving parts |
| Networking | VPC 2 AZs; ALB public; Fargate tasks in public subnets with security groups locked to ALB (no NAT Gateway at MVP, saves ~$45+/mo per AZ) or private subnets + VPC endpoints — decide in ADR; RDS/ElastiCache in isolated subnets | |
| IaC | **AWS CDK (TypeScript)** in `infra/deployment/` — stacks: `Network`, `Data` (RDS, ElastiCache, S3), `Services` (ECS, ALB), `Edge` (CloudFront, certificates), `Observability`, `Backup` | Same language as the monorepo; agents already edit TS; `aws-cdk` skill available. Terraform rejected: second language/toolchain, no benefit for single-cloud. |
| Accounts | AWS Organizations: `gugu-staging`, `gugu-prod`, `gugu-backup` (snapshot copies); IAM Identity Center for humans; deploy role from local CLI, GitHub OIDC once a remote exists | Blast-radius isolation |
| Backups | RDS automated PITR + AWS Backup daily snapshot copy to `gugu-backup` (cross-account, optionally ap-southeast-3/7 cross-region); S3 versioning; Valkey treated as rebuildable (jobs idempotent, reconciled from DB/outbox) | |

**Rough monthly cost at MVP scale (USD, on-demand, before credits — verify with AWS Pricing Calculator):**

| Item | Prod | Staging |
|---|---|---|
| Fargate (5 tasks prod / 3 small staging, ARM) | ~$90–120 | ~$35 |
| ALB | ~$25 | ~$20 |
| RDS t4g.medium Multi-AZ + 50 GB gp3 + backups (staging: t4g.micro single-AZ) | ~$160–190 | ~$20 |
| ElastiCache Valkey t4g.small ×2 (staging ×1) | ~$50–60 | ~$25 |
| S3 + CloudFront media | ~$10–30 | ~$5 |
| CloudWatch logs/metrics/alarms | ~$20–40 | ~$10 |
| Secrets Manager, SSM, SES, Route 53/ACM | ~$10–15 | ~$5 |
| Cloudflare Pro (optional) | ~$20–25 | — |
| Sentry Team (shared) | ~$26 | — |
| **Total** | **~$450–600** | **~$120–150** |

Not included: ZBS Template Message sends (metered per message, topics 09/11/12), Claude API usage (08), NAT Gateway if chosen (~$45+/AZ + data). No SMS provider and no hosted analytics (in-house).

- R28. Migrations run as a one-off ECS task before the new task definition takes traffic; expand/contract only; failure aborts the deploy.
- R29. All infra changes via CDK; `cdk diff` output attached to the review; no console changes in prod.
- R30. Container images built locally/CI, pushed to ECR with SHA tags, scanned by ECR enhanced scanning.

### 3.6 Observability & operations
Now: JSON logs locally and Sentry dev projects (R31–R32). Dashboards and alarms (R33–R34) arrive with 13-M13.6. No on-call (q45).
- R31. Sentry everywhere (`@sentry/react-native` + Expo plugin with source maps via EAS, web SDK, `@sentry/nestjs`); release = git SHA + EAS update ID; PII scrubbing on.
- R32. JSON logs to stdout → CloudWatch; request ID from Cloudflare (`cf-ray`) / ALB → API → jobs.
- R33. (Later) Dashboards: latency, 5xx, queue depth/lag, failed jobs, booking-create success rate, notification delivery rate per channel (`push`, `email`, `zalo_template`, `zalo_oa`; `sms` mock only).
- R34. (Later) Alarms emailed to the owner — no on-call rota: API 5xx rate, p95 latency, queue lag, failed-job spike, RDS CPU/storage/connections, Valkey memory, AASA availability, backup failure, SES bounce/complaint rate. Each links a runbook in `docs/runbooks/`.

### 3.7 Testing strategy
- R35. Unit (runner per 01) — pure domain logic; booking availability/transition modules ≥ 90% line coverage.
- R36. API integration — NestJS testing module + real Postgres/Valkey; isolated per test (transaction or schema); factories.
- R37. Contract — OpenAPI generated from NestJS, `packages/api-client` generated; drift fails `verify`.
- R38. Concurrency — N parallel creates for one slot → exactly `capacity` succeed, rest get the conflict code, no orphan holds.
- R39. Tenant isolation — matrix derived from OpenAPI tenant-scope annotations; unannotated tenant endpoint fails `verify`.
- R40. i18n — vi/en key parity; core journeys in both locales.
- R41. Web E2E (Playwright) — §26 journeys incl. tenant-escape attempt.
- R42. Native E2E (Maestro) — launch, locale switch, OTP login via provider-sink, browse, book, deep link, push permission. Simulators/emulators: small iPhone (SE class) + recent iPhone; low-end Android profile (Android 10, ~3 GB RAM — common in VN) + recent Pixel. Real-device pass on the team's own phones before each store release (no device farm, q45).
- R43. Accessibility — axe in Playwright on public pages; VoiceOver/TalkBack checklist per release.
- R44. Load — k6: search p95 < 300 ms, availability p95 < 400 ms, booking create under contention; locally now (indicative), against staging later.
- R45. LLM evals (08) — vi/en questions over the deterministic seed with expected tool calls and numbers; cross-tenant and prompt-injection probes (review text, notes, Zalo messages); pass-rate threshold and cost per run in `evals/thresholds.json`.

### 3.8 Backups & DR — LATER (with 13-M13.6)
- R46. RDS PITR + cross-account daily snapshot copies (30-day retention); S3 versioning; restore drill before launch, logged in `docs/runbooks/restore-drill.md`. Nothing now: local data is reproducible seed data.

### 3.9 Production readiness (phase 7)
- R47. `docs/release/production-readiness.md`: security review sign-off (05), load results, restore drill, alarm coverage, store listings, privacy policy/terms, account deletion, data export, incident process (owner-only, no on-call), status page, legal review (if the owner has scheduled one by then).

---

## 4. Proposed technical approach (summary)

- pnpm + Turborepo (final in 01); `pnpm verify` / `pnpm gate` are the only gates, identical locally and in future CI.
- Compose for stateful deps; app processes on host; containerized profile for parity with ECS images.
- Local git workflow: worktree per agent task → hooks → gate → reviewer-agent verdicts bound to SHA → `merge-to-main`.
- EAS Build/Update for native (works without a remote); Maestro locally now, EAS Workflows later.
- Later — AWS ap-southeast-1: ECS Fargate (api/worker/web) + RDS PostgreSQL (PostGIS, btree_gist) + ElastiCache Valkey (node-based) + S3/CloudFront + SES + Secrets Manager, Cloudflare at the edge, CDK TypeScript, separate staging/prod/backup accounts.
- Sentry now (dev); CloudWatch with AWS later; ADOT/OTel only if needed.
- Provider-sink for every external channel (email, push, Zalo, SMS mock); in-house analytics only.

---

## 5. Acceptance criteria

1. Clean machine: `pnpm bootstrap` → `health/ready` 200 with all deps `up`; web opens in vi by default.
2. `pnpm reset --yes && pnpm bootstrap` reproduces identical seed IDs.
3. Android emulator and iOS simulator dev builds connect to the local API.
4. `eas build --profile preview` from the local repo yields installable Android and iOS internal builds pointed at staging; three variants install side by side.
5. Universal/App Link to a seed salon opens the app when installed, the web page otherwise; Maestro flow passes on both OSes.
6. A commit attempted directly on `main` is rejected by the hook; `pnpm merge-to-main` refuses a branch whose required reviewer verdict is missing or bound to an older SHA, and refuses when `pnpm gate` fails — `main` unchanged in both cases.
7. Two agents working in separate worktrees can merge sequentially without touching each other's working trees.
8. A deliberately broken test makes `pnpm gate` end with `STATUS: fail` and `reports/gate-summary.md` naming file, test, and first error line.
9. Provider-sink exposes captured email/push/`zalo_template`/`zalo_oa`/SMS-mock messages over HTTP; no test or local run calls a real provider.
10. Concurrency: 20 parallel requests for a capacity-1 slot → exactly 1 success, 19 conflicts, no orphan holds.
11. Tenant-isolation matrix covers 100% of tenant-scoped endpoints; an unannotated endpoint fails `verify`.
12. *(Later, 13-M13.6)* `cdk deploy` creates staging from scratch in ap-southeast-1; `pnpm deploy:staging` runs migrations as a one-off task before traffic shift and aborts on migration failure.
13. *(Later)* RDS reports `postgis` and `btree_gist` installed; an exclusion constraint migration applies on staging.
14. *(Later; locally against Compose Valkey now)* BullMQ jobs run against ElastiCache Valkey with `noeviction`; killing a worker task loses no committed job (outbox reconciliation).
15. Sentry (dev project) receives a test error from iOS, Android, web, API, worker with readable stacks and no phones/OTPs.
16. *(Later)* Restore drill documented with measured RTO.
17. LLM eval run reports pass rate and cost, and blocks merge under threshold when agent paths changed.

---

## 6. Dependencies

- **01** — workspace tool, test runner, scripts (`verify`, `gate`, `bootstrap`), lefthook adoption.
- **04** — migrations, seed schema, required Postgres extensions, raw-SQL migration conventions, presigned upload contract.
- **05** — scan rules, secret classes, OTP provider contract, tenant-scope annotation (R39), security-reviewer scope.
- **06** — concurrency invariants and cases (R38).
- **03** — key parity tooling (R40).
- **08** — eval dataset, thresholds, tool schemas (R45); Claude API key in Secrets Manager.
- **09 / 11** — provider interfaces the sink emulates: email, push, `zalo_template` (ZBS Template Message), Zalo OA webhooks/messages, SMS mock.
- **10** — web output mode (spike S1) decides `web` ECS service vs S3+CloudFront; AASA serving.
- **12** — feature flags for staged rollouts; usage metering of paid channels; in-house analytics storage (no hosted analytics).
- **02** — 3D hero asset size budgets enforced in `verify`; CDN cache rules for hero assets.

---

## 7. Suggested sub-milestones

IDs match the GuGu Roadmap tracker (`tasks` collection).

1. **13-M13.1 Local stack** — Compose, `.env.example`, bootstrap/reset, health endpoints, provider-sink (push, `zalo_template`, `zalo_oa`, SMS mock), Mailpit. (step s02)
2. **13-M13.2 Local merge gate** — `pnpm verify`/`gate`, lefthook hooks, reports + summary, worktree convention, reviewer-verdict files, `merge-to-main`. (s02 — blocks all multi-agent work)
3. **13-M13.3 EAS dev builds** — variants, `eas.json`, dev clients on simulator/emulator, `run-locally` skill verified by an agent. (s02)
4. **13-M13.4 Agent docs finalised** — `git-workflow` skill, ADR for the local merge gate. (s02)
5. **13-M13.5a Tenant-isolation matrix generator** (s03) and **13-M13.5b Booking concurrency harness** (s04) — with 05/06.
6. **13-M13.7 Native E2E** — Maestro on simulators/emulators, deep links via custom scheme. (s09)
7. **13-M13.8 Product-agent evals in the local gate.** (s08, with 08)

**Later (tracker step `later` — owner: "deploy when we have an app"):**
- **13-M13.6 AWS staging + Cloudflare** — accounts, CDK stacks, ECR/ECS/RDS/Valkey/S3/CloudFront/SES, Cloudflare, Sentry prod, `deploy:staging`, AASA/assetlinks on `staging.gugu.vn`, alarms to owner email.
- **Remote + CI** (no tracker id yet) — when a GitHub remote exists: branch protection, Actions calling the same scripts, claude-code-action, OIDC deploys, repo backups revisited.
- **13-M13.9 Production** — prod stacks, PITR + cross-account backups, runbooks, k6 vs staging, restore drill, store pipeline; **stores** task for submission.

## 8. AI-first deliverables

| Artifact | Path | Status |
|---|---|---|
| Subagent: platform & DevOps | `.claude/agents/platform-devops.md` | drafted (local workflow + AWS) |
| Subagent: test engineer | `.claude/agents/test-engineer.md` | drafted |
| Skill: run the stack & verify platforms | `.claude/skills/run-locally/SKILL.md` | drafted (commands real after M13.1/M13.3) |
| Skill: testing + local merge gate | `.claude/skills/testing/SKILL.md` | drafted |
| Domain doc | `docs/domains/platform-devops.md` | skeleton |
| Recommended new skills (not yet created) | `.claude/skills/git-workflow/` (worktrees, verdict files, merge-to-main) now; `.claude/skills/aws-deploy/`, `.claude/skills/release/` later | M13.2 / 13-M13.6 / 13-M13.9 |
| ADRs | local merge gate (M13.2); hosting, compute, Valkey, CDK (13-M13.6) | |
| Runbooks | `docs/runbooks/*.md`, one per alarm, read-only diagnosis steps | 13-M13.9 |

Domain-specific agent rules: every operational action is a script; scripts end with `STATUS: ok|fail <reason>`; destructive scripts need `--yes` and refuse non-local targets; production deploy needs a human-typed confirmation that agents must not supply.

---

## 9. Product AI-agent surface

| Tool | Type | Purpose | Permission | Notes |
|---|---|---|---|---|
| `system.get_status` | read | Answer "why didn't my customer get the reminder?" with coarse channel health (`push`, `email`, `sms`, `zalo_template`, `zalo_oa`) and platform status | any salon role | Aggregates only; no hostnames, no other tenants' data |

Developer agents (not the product agent) may get read-only ops access via MCP (Sentry, CloudWatch Logs) scoped to staging; production read-only and logged.

---

## 10. Open questions for the product owner

Answered and applied: q01, q02, q04, q05, q08, q10, q45, q56, q57, q58, q59. Nothing currently blocks topic 13 near-term work (13-M13.1–13-M13.5b, 13-M13.7, 13-M13.8).

Deferred until 13-M13.6 (raise in the tracker then): data residency if a VN entity is created; AWS account + Activate credits; git remote host/timeline.
