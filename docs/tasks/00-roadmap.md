# GuGu — build roadmap

Build order for the 13 topic specs in `docs/tasks/01–13`. Read this first to know **what to build next**; read the topic spec for **how**. Milestone IDs (e.g. `M6.3`, `S4`, `Z1.2`) refer to the "Suggested sub-milestones" section of each spec. Open product questions are in [`open-questions.md`](open-questions.md); each step lists the questions that block it.

Status: **not started** (specs only, 2026-11-02).

## Topic index

| # | Topic | Spec | Owner agent | Skills |
|---|---|---|---|---|
| 01 | Architecture, monorepo, AI-first workflow | `01-architecture.md` | `architecture`, `orchestrator` | `architecture` |
| 02 | Design system, brand, 3D hero | `02-design-system.md` | `design-system`, `design-reviewer` | `design-system`, `3d-hero` |
| 03 | Localization vi/en | `03-localization.md` | `localization` | `localization` |
| 04 | Backend core, database, media | `04-backend-database.md` | `backend-database` | `backend-module`, `prisma-migration` |
| 05 | Auth, tenancy, security, privacy | `05-auth-security.md` | `auth-security`, `security-reviewer` | `tenant-authorization` |
| 06 | Booking engine | `06-booking-engine.md` | `booking-engine` | `booking-engine` |
| 07 | Salon SaaS / CRM | `07-salon-crm.md` | `salon-crm` | `salon-crm` |
| 08 | AI business agent | `08-ai-agent.md` | `ai-agent` | `agent-tool` |
| 09 | Zalo integration | `09-zalo.md` | `zalo` | `zalo-integration` |
| 10 | Marketplace + SEO | `10-marketplace-seo.md` | `marketplace-seo` | `seo-page`, `search` |
| 11 | Customer, reviews, notifications | `11-customer-notifications.md` | `customer-notifications` | `notification-event` |
| 12 | Monetization, attribution, admin, analytics | `12-monetization-admin.md` | `monetization-admin` | `entitlements`, `analytics-event` |
| 13 | Native builds, infra, DevOps, testing | `13-platform-devops.md` | `platform-devops`, `test-engineer` | `run-locally`, `testing` |

## Cross-topic resolutions (override the topic specs)

Where specs disagree, these decisions win. Owner agents MUST apply them to their spec, agent and skill files before implementation starts.

| # | Conflict | Decision | Specs to update |
|---|---|---|---|
| X1 | Privacy law: several specs cite Decree 13/2023. | The governing regime from 2026-01-01 is the **Personal Data Protection Law 91/2025/QH15 + Decree 356/2025/ND-CP** (per 05). Decree 53/2022 remains relevant to data localisation. No spec claims compliance; legal review is required. | 01, 04, 08, 11 |
| X2 | "ZNS" naming. | Since 2026-01-01 ZNS is merged into **ZBS Template Message** (per 09). Channel id in code: `zalo_template`. "ZNS" may appear only as a historical alias. | 03, 04, 05, 06, 07, 11, 12, 13 |
| X3 | Shared packages: 04/05 use `packages/validation` and `packages/types`. | Per 01: **`packages/contracts`** = Zod schemas + inferred types + error codes; **`packages/domain`** = pure logic (permission matrix, booking math, metric registry definitions). No `types` or `validation` package. | 04, 05 + their agents/skills |
| X4 | Multi-capacity resources: 04 proposes row locking, 06 proposes capacity units. | Per 06: a resource of capacity N has N `resource_unit` rows, all covered by the same `EXCLUDE USING gist` constraint on `booking_occupancy`. Advisory locks only for rules a constraint cannot express. | 04 |
| X5 | Revenue labels named differently in 07, 08, 12. | One enum `RevenueKind = estimated_from_bookings \| recorded_offline_sale \| reported_by_salon`, defined in `packages/domain/metrics` (owner 07). Never summed across kinds without a label. | 07, 08, 12 |
| X6 | Booking/acquisition sources added independently by 06, 07, 09, 12. | One enum owned by 12: `marketplace, salon_profile, direct_link, qr_code, social_media, repeat_customer, staff_created, walk_in, phone, zalo_chat, zalo_oa, zalo_link, zalo_mini_app, promoted_listing, gugu_campaign, ai_agent`. 12 also maps each to `gugu_acquired` vs `salon_acquired`. | 06, 07, 09, 12 |
| X7 | Registries: 04 "read-model registry", 07 "metric registry", 08 "tool registry". | Layered, not competing: **04** read-model registry (backend queries + permission + tenant scope + untrusted-field flags) → **07** metric catalogue built on read models → **08** product-agent tools generated from both. Interfaces are fixed in Step 3 (`A0`), even though the agent ships in Step 8. | 04, 07, 08 |
| X8 | Expo SSR maturity: 01 says alpha, 10 says stable in SDK 58. | Undecided until spike **S1 (10)**. Both specs keep the fallback (static pre-render + edge metadata). Result recorded as an ADR. | 01, 10 |
| X9 | Which bookings are drafts: 06 keyed it on source, 09 disagreed. | Keyed on **actor + phone verification**: AI agent → always a draft; salon staff entry (incl. `zalo_chat`) → confirmed by that entry; customer self-service (incl. `zalo_link`, `zalo_oa` button, `zalo_mini_app`) → normal flow with OTP-verified phone, otherwise a draft. | 06, 09 |
| X11 | Phone OTP at booking (owner decision 2026-11-02). | **Booking does not require OTP.** A customer books with name + phone (or a signed-in account) in as few steps as possible. Abuse is limited without an OTP wall: rate limits per device/IP/phone, bot check on web, no-show/late-cancel history per phone, a salon setting to confirm first-time or unverified customers, and an optional "confirm" link in the booking message. Phone verification stays only where needed (account recovery, sensitive changes). Supersedes the "OTP-verified phone" condition in X9: customer self-service bookings are normal bookings flagged `identity_verified=false` until verified. | 05, 06, 09, 10, 11, 12 |
| X12 | SMS and OTP (owner, q48/q11). | **No SMS and no SMS OTP for now.** Customer verification (when needed) goes by email link or a Zalo message (once Zalo is live). Sign-in: email magic link, Apple, Google; Zalo Login built but hidden until the central GuGu OA exists (q28). The SMS provider stays a mock behind the channel interface so a real one can be plugged in later. Customers must find booking effortless. | 05, 09, 11, 12, 13 |
| X13 | Product priority (owner, q18). | **GuGu is primarily a SaaS for salons; the marketplace is an addition.** CRM quality and onboarding come first. Revenue = monthly/yearly SaaS subscriptions (q21, q34); no commissions now, no prepaid packages. Multi-location chains with combined reporting at launch (q19). AI onboarding — salons upload screenshots/photos of their price list and AI builds services — is in **every** plan and marketed as "effortless AI setup" (q42). AI assistant + monthly Opus business review in **Pro** (q31, q63), with a hard cost cap (q32). | 07, 08, 12, 10 |
| X14 | Analytics (owner, q36). | **Build analytics in-house** on our own Postgres (events table + rollups); no PostHog or other third-party analytics. | 12, 13 |
| X15 | 3D hero production (owner, q51/q52). | **No 3D artist budget: the hero is produced with AI tools** (AI-generated chibi isometric diorama renders, AI image-to-video loops, image-to-3D only if quality allows), layered for parallax and interaction on web. Real-time R3F is optional, not required. | 02, 10 |
| X16 | Environments now (owner, q57/q59/q45/q04). | **Localhost only** until there is an app worth deploying: no AWS account, staging, backups, git remote or on-call yet; legal review postponed. Keep the AWS design as a later milestone. | 13, 01, 05 |
| X17 | Subscription plans (owner, 2026-11-02). | **No free plan.** Plans are **Basic, Pro, Ultra** (monthly/yearly). AI onboarding import in all three; AI assistant + monthly review from Pro. Ultra contents per tracker q75. **14-day trial: Pro features with Basic limits** (AI cap, message quotas) to prevent AI abuse. | 07, 08, 09, 12 |
| X18 | Dark mode (owner, 2026-11-02; supersedes q44/q77). | **No dark mode on the public site / marketplace / customer app** — light theme only. Dark mode exists **only in the SaaS management panel** (salon CRM workspace and platform admin). The dark-mode hero variant is dropped. | 02, 07, 10, 12 |
| X10 | Personal data and LLMs (owner decision 2026-11-02). | **No personal data is sent to any LLM**, including staff names, notes, reviews and Zalo messages. Agent tools return aggregates and pseudonymous tokens, re-hydrated server-side after the model call; a PII guard + tests block leaks. Features needing personal data (review summaries/moderation by AI, paste-from-Zalo parsing, Zalo chat agent Z3, client search tools) are deferred. LLM provider: Anthropic API directly. | 07, 08, 09, 11, 12 |

## Parallel tracks (run alongside the steps)

- **T-BIZ — business & legal** (no code): Vietnamese legal entity, `gugu.vn` domain, Apple/Google developer accounts, SMS brandname, Zalo OA + ZBS Account, legal review (PDPL, data residency, consumer/e-commerce rules), field interviews with 5–10 salons. Starts now; blocks Z1, OTP over SMS in production, store release, launch.
- **T-HERO — 3D hero** (02): `HERO-1` starts the day references arrive in `design/hero-references/`; `HERO-2` (Blender scene, glTF, poster, native video) runs in parallel with Steps 3–6; `HERO-3` lands in Step 9. Homepage ships with the poster slot until then.
- **T-AI-DEV — AI-first tooling** (01, 13): agents, skills and `docs/domains/*` are updated in the same PR as the code they describe; `pnpm agents:check` keeps them in sync from Step 2 onward.

## Steps

Each step ends with a **gate**: tests green (`pnpm verify`), docs updated, both locales checked, platforms checked as listed, and a written report of what is done vs. not done.

### Step 0 — Decisions and cleanup (no code)
- Product owner answers the **P0** questions in `open-questions.md`.
- Owner agents apply cross-topic resolutions X1–X7 to their specs, agents and skills.
- DS-1: three art-direction routes + Vietnamese typeface test → product owner picks one.
- **Gate:** P0 questions answered or explicitly deferred; `grep` finds no "13/2023" as current law, no `packages/validation`.

### Step 1 — Spikes (1–3 days each, in parallel)
- **01 A1:** Expo SDK 58 + Expo Router + NativeWind v4.2 vs v5 rc on 3 platforms → ADR-0004.
- **04 S0:** Prisma 7 + adapter-pg + PostGIS `Unsupported` + exclusion constraint + `migrate diff` drift check → ADR-0001, ADR-0002.
- **10 S1:** server rendering on SDK 58 with NativeWind, i18n, loaders, metadata → ADR (resolves X8).
- **03 M1 (spike part):** Hermes `Intl` formatter tests on iOS/Android dev builds → polyfill decision.
- **Gate:** ADRs 0001–0005 accepted in `docs/adr/`.

### Step 2 — Foundation (master-prompt Phase 1)
- 01 A2–A7 · 13 M13.1–M13.4 · 04 S1 · 03 M1–M3 · 02 DS-2–DS-3.
- **Gate:** `docker compose up` + `pnpm dev` run app on web and iOS/Android dev builds, API `/health`, Swagger, vi/en switch, CI T0/T1 green, Claude PR review active, `run-locally` skill verified by an agent.

### Step 3 — Identity, tenancy, contracts
- 04 S2 · 05 steps 1–5 (permission matrix, phone OTP via provider-sink, sessions + refresh rotation, guards, audit log, invitations, generated cross-tenant suite) · 03 M4 · 12 M12.1 (entitlements core, free plan seeded) · 13 M13.5 (tenant-isolation matrix) · 08 A0 (tool/read-model/metric interfaces, X7).
- Blocked by: P0 SMS provider (production only; dev uses the sink).
- **Gate:** customer and salon user can sign in with OTP on all 3 platforms; cross-tenant suite green; no endpoint without a guard (boot check).

### Step 4 — Booking core
- 04 S3–S5 · 06 M6.1–M6.5 · 13 M13.5 (concurrency harness) · 11 M11.1 (outbox consumer, in-app channel, template coverage) · 02 DS-4–DS-5 · 12 M12.2 (attribution inside the booking transaction).
- Blocked by: P1 booking-policy questions (auto-confirm, cancellation cutoff, limits).
- **Gate:** 20 parallel requests for one slot → exactly 1 booking; state machine + history tests; idempotent retries; booking engine coverage ≥ 90%.

### Step 5 — Salon SaaS (master-prompt Phase 2)
- 07 M7.1–M7.6 · 06 M6.6–M6.7 · 04 S6 (media) · 02 DS-6 · 09 Z0.1–Z0.2 (Zalo deep links, "Nhắn Zalo", snippets, QR — no API).
- **Gate:** a salon registers, finishes onboarding in < 10 min, configures services/staff/hours, and creates, moves, checks in and completes real bookings in the CRM on desktop web and phone; tap budgets from 07 met.

### Step 6 — Customer marketplace (master-prompt Phase 3)
- 10 steps 2–7 (locations, search read model, salon/service pages, search UI, homepage with poster hero, sitemaps/OG/llms.txt) · customer booking flow · 04 S7–S8 · 11 M11.2–M11.3 (push, reminders) · 05 step 7 (Apple/Google login) · 12 M12.6 + taxonomy/locations part of M12.10 (minimal admin) · 13 M13.6 (staging).
- Blocked by: P1 launch cities, maps provider.
- **Gate:** a customer discovers a salon on web and native, books a real slot, sees it in history; the salon sees it in the CRM; Lighthouse and structured-data checks pass on public pages in vi and en.

### Step 7 — Trust, reviews, channels, insights
- 11 M11.4–M11.8 (email/SMS, fallback, preferences, reviews, moderation, deletion/export) · 05 step 8 (privacy) · 07 M7.7–M7.8 (CRM directory, notes, metric registry, Insights, OfflineSale) · 12 M12.3–M12.4 (analytics, feature flags) · 09 Z1.1–Z1.3 (central GuGu OA + ZBS templates; only if T-BIZ has the entity).
- **Gate:** review only after completed visit; reminders correct after reschedule/cancel; internal notes never in customer responses (contract test); Insights numbers match the metric registry.

### Step 8 — AI business agent (beta)
- 12 M12.5 (usage metering) · 08 A1–A4 · 05 step 10 (agent principal envelope) · 07 M7.9 (price-list import, paste-from-Zalo, assistant panel) · 13 M13.8 (evals in CI).
- Blocked by: P2 plan/price for the agent; P0 legal answer on sending salon data to an external LLM.
- **Gate:** eval suite ≥ 95% numeric accuracy, 100% security cases; quotas enforced; every tool call audited; beta enabled per salon via entitlement.

### Step 9 — Zalo inbox, 3D hero, native polish (master-prompt Phase 5)
- 09 Z2.1–Z2.3 (salon OA connect, webhooks, CRM inbox) · 07 M7.10 · 08 C (agent drafts on Zalo) · 02 HERO-3 · 13 M13.7 (Maestro native E2E, deep links) · 10 step 8 (map).
- **Gate:** hero meets budgets (≤ 250 KB JS, ≤ 1.5 MB assets, LCP ≤ 2.5 s, Lighthouse mobile ≥ 85) with poster fallback; universal/app links open the right screen; Zalo 7-day/48-hour reply windows enforced in UI and backend.

### Step 10 — Admin and monetization foundations (master-prompt Phase 6)
- 12 M12.6–M12.11 (verification, suspension, trust, commission ledger shipped inactive, rollups, moderation, promoted-listing foundation) · 05 step 9 (admin TOTP/passkey, impersonation) · 08 B (confirmed write actions) · 06 M6.8–M6.9 (multi-service phase B, agent/Zalo booking drafts) · 09 Z3.1–Z3.2.
- **Gate:** every admin action has a reason and an audit row; no automatic charges anywhere; agent writes only through confirmed proposals and the booking engine.

### Step 11 — Production readiness (master-prompt Phase 7)
- 13 M13.9 (prod infra, backups/PITR, alerts, runbooks, load test, restore drill, store pipeline) · 10 step 9 (performance + a11y) · full `security-reviewer` pass · legal review sign-off (T-BIZ) · App Store / Google Play submission.
- **Gate:** readiness checklist in 13 complete; restore drill passed; legal sign-off recorded.

### Later (post-MVP, behind flags)
09 Z4 (Zalo Mini App, needs ADR — it is a separate React target) · 08 D (MCP server) · 02 HERO-4 (native real-time 3D) · 06 phase C (multi-staff multi-service) · 12 M12.12 (Admin Copilot) · commission activation · subscription payment gateway.

## Coverage: master-prompt sections → topics

| Section | Topics | Section | Topics |
|---|---|---|---|
| 1 Role / universal app | 01 | 16 Notifications | 11, 09 |
| 2 Product vision | all | 17 Attribution, monetization | 12 |
| 3.1–3.2 Frontend, UI | 01, 02 | 18 Platform admin | 12 |
| 3.3 Backend | 04 | 19 Database | 04 |
| 3.4 Infrastructure | 13 | 20 SEO, sharing | 10 |
| 4 Monorepo | 01 | 21 Media | 04 |
| 5 Localization | 03 | 22 Mobile-specific | 13 |
| 6 Design system | 02 | 23 Web-specific | 10, 07 |
| 7 Public marketplace | 10 | 24 Security, privacy | 05 |
| 8 Salon profiles | 10, 07 | 25 Performance | 01, 04, 10 |
| 9 Service catalog | 10, 07, 04 | 26 Testing | 13 (+ each topic) |
| 10 Customer experience | 11, 05 | 27 Analytics | 12 |
| 11 Booking flow | 06, 10 | 28 Execution plan | this file |
| 12 Booking engine | 06 | 29 Engineering rules | 01 |
| 13 Salon management | 07 | 30 First task | Steps 0–2 |
| 14 Multi-tenancy | 05 | Extra: 3D hero | 02 |
| 15 Reviews | 11 | Extra: AI agent / Zalo | 08 / 09 |
