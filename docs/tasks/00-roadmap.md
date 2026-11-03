# GuGu — build roadmap

Build order for the 13 topic specs in `docs/tasks/01–13`. Read this first to know **what to build next**; read the topic spec for **how**. Milestone IDs (e.g. `M6.3`, `S4`, `Z1.2`) refer to the "Suggested sub-milestones" section of each spec. Open product questions are in [`open-questions.md`](open-questions.md); each step lists the questions that block it.

Status: **SaaS core built** (2026-11-04); see the Steps table and the live tracker.

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
| X19 | **Pivot (owner, 2026-11-02): SaaS first, marketplace later.** | GuGu ships first as a plain SaaS for running a salon business. The marketplace stays the long-term goal but is deferred: no discovery, search, category/location hubs or marketplace SEO in the first release. Kept as part of the SaaS: each salon's own public booking page (direct link / QR / Zalo link) so its customers can book online, plus notifications to those customers. Build order becomes: booking engine + CRM (services, team, hours, AI onboarding import, calendar, Today, clients) → salon booking page → notifications/reminders → insights → AI assistant (Pro) → Zalo → admin/billing → later marketplace (Step 6 content). Homepage becomes a **SaaS landing page for salon owners** in the same visual style (the consumer homepage code stays in the repo for the marketplace later). It announces the future marketplace: once GuGu opens a Vietnamese company, partner salons will be listed in the marketplace free of charge, and **every salon that buys a subscription before the marketplace launches is fully exempt from booking fees for its first 2 years** after launch — with a clear disclaimer that the marketplace starts only after the Vietnamese company is opened, in line with Vietnamese law (X20). | all |
| X21 | **Product/legal model (owner, 2026-11-02).** | GuGu is a pure tool; the salon is the seller. Each salon has only its own public page at **`gugu.vn/<salon-slug>`** (no subdomains — owner: not allowed under Vietnamese rules) with an option to connect the salon's **own domain**. The salon shares its link itself (Zalo, Facebook, QR). **No search, directory or listing of salons on gugu.vn; no shared customer account used across salons** (customers book per salon, guest-style, X11). Marketplace remains a possible future after a Vietnamese company exists. | 05, 06, 07, 10, 11, 12 |
| X22 | **Brand + landing (owner, 2026-11-02).** | The SaaS is called **GuGu Studio**, shown with the normal gugu logo (+ "Studio"). The homepage becomes an **Apple-style scroll-storytelling landing** following `design/landing-references/` loosely (not 1:1): scrolling dives into the living salon diorama with people working; the story contrasts the manual way (Zalo chats, paper notebook) with GuGu Studio, ending with the salon sending its own booking page (availability + booking) to a customer. Product screenshots must be real captures of our CRM (regenerated as the CRM grows). Features shown only from our scope (no payments, no SMS marketing). | 02, 07, 10 |
| X23 | **No public salon pages on gugu.vn (owner, 2026-11-02; supersedes the page part of X21/X19).** | Under Law 122/2025 an intermediary platform is one that lets other parties open accounts to present/sell goods or services on it; a salon publishing services and taking bookings on `gugu.vn/<salon-slug>` meets that literally, even without a directory. So **salons get no public booking page / profile on gugu.vn**. GuGu Studio is an internal tool for the salon's team: bookings are entered by staff (from Zalo, phone, walk-ins), and the salon can send customers availability and confirmations as messages (Zalo/email) generated in the app. Any customer-facing booking surface (e.g. on the salon's own domain) is out of scope until a Vietnamese legal review says otherwise. No legal conclusions are claimed here. | 02, 05, 06, 07, 09, 10, 11, 12 |
| X24 | **Zalo booking chatbot in the salon's own OA (owner brief, 2026-11-02).** | Customer-facing booking happens **inside the salon's own Zalo OA chat**, never on our website: each salon connects its OA (OAuth + PKCE, encrypted per-salon tokens, auto-refresh, reconnect/disconnect); one webhook for all OAs with signature check, routing by OA ID, idempotent events; a rule-based (no LLM) button/quick-reply chatbot: greet → service → staff/any → slots for the next 14 days from our engine (q97, capped by the salon's booking window) → confirm → booking in our calendar → confirmation; staff hand-off from the panel; the bot always speaks as the salon and never mentions GuGu; vi copy with en fallback. Confirmations/reminders (24 h, 2 h) via ZBS Template Messages with Confirm / Cancel / Reschedule buttons handled in Zalo; staff notified of changes. 48 h free / 48 h–7 d paid / >7 d rejected window tracked per customer per OA; quotas, queue + backoff, every send logged with status and cost. Hard constraints: no links sending customers to our website, no customer accounts (records belong to one salon), official Zalo APIs only. Supersedes q70's "paid templates only from a central GuGu OA" for this flow (messages go from the salon's OA; who pays is open). | 06, 07, 09, 11, 12 |
| X25 | **Basic free for the first year, then 99,000 VND/month; Basic has no AI assistant (owner, 2026-11-04; amends X17).** | Every new salon gets the Basic plan free for 12 months from registration, then Basic costs 99,000 VND/month. Basic includes the AI price-list import (setup) but **not** the AI business assistant; the assistant starts at Pro. Pro and Ultra prices and AI caps stay as in X17. The 14-day Pro trial stays as an upgrade taster (Pro features, Basic-level AI cap) — open question q96. The homepage advertises "Basic free for everyone for the first year". | 08, 12, 02 |
| X26 | **No emails to salon customers (owner, q85/q86, 2026-11-04).** | Customers are reached only through the salon's Zalo OA (confirmations, changes, cancellations, reminders); when the OA cannot reach a customer, nothing is sent and the booking drawer says so. GuGu sends no customer email of any kind: no email fallback, no reply-to, no `.ics`. Staff/team emails, magic links and invitations are unaffected. **Client email may be stored, never used (q87):** an optional email lives on the CRM client profile (same visibility as the phone), not on the booking. | 06, 07, 09, 11, 12 |
| X10 | Personal data and LLMs (owner decision 2026-11-02). | **No personal data is sent to any LLM**, including staff names, notes, reviews and Zalo messages. Agent tools return aggregates and pseudonymous tokens, re-hydrated server-side after the model call; a PII guard + tests block leaks. Features needing personal data (review summaries/moderation by AI, paste-from-Zalo parsing, Zalo chat agent Z3, client search tools) are deferred. LLM provider: Anthropic API directly. | 07, 08, 09, 11, 12 |

## Parallel tracks (run alongside the steps)

- **T-BIZ — business & legal** (no code): Vietnamese company (needed before the marketplace), `gugu.vn` domain, Apple/Google developer accounts, Zalo developer App (owner registers it, q81), email provider + sending domain (q86), legal review (PDPL, cross-border data, Law 122/2025, consumer rules), interviews and Zalo-OA pilot salons. Blocks the real Zalo pilot, store release and launch.
- **T-AI-DEV — AI-first tooling** (01, 13): agents, skills and `docs/domains/*` change in the same commit as the code they describe; `pnpm agents:check` keeps them in sync.

## Steps (after the SaaS-first pivot, X19/X21/X23/X25)

GuGu is built **SaaS-first**: GuGu Studio is the salon's internal tool (staff, owner, platform admin). Customers have no accounts and no booking surface on gugu.vn (X23); they book through the salon's own Zalo OA chatbot (X24) or by phone/walk-in entered by staff. The marketplace comes later, after a Vietnamese company and a legal review. The live status of every task is in the tracker artifact; this section is the map.

Each step ends with a **gate**: `pnpm verify` + API integration tests green (own `*_test` DB), `pnpm e2e:web` for UI changes, reviewers' verdicts, docs updated, both locales checked.

| Step | Scope | Status (2026-11-04) |
|---|---|---|
| 0 Decisions and cleanup | P0 answers, X1–X25 applied | done |
| 1 Spikes | Expo SDK 58 + NativeWind 5 rc (ADR-0004), Prisma 7 + PostGIS (ADR-0001/0002) | done (Android check pending, q79) |
| 2 Foundation | monorepo, app/API shells, local stack, vi/en, design tokens, local merge gate | done (gate script/hooks still open) |
| 3 Identity & tenancy | staff/owner magic-link sign-in, permission matrix, guards, audit, invitations, entitlements core | done |
| 4 Booking core | slot math, occupancy exclusion constraints, holds, state machine, outbox, idempotency, race harness | done |
| 5 Salon SaaS (CRM) | Today, calendar (drag, earliest slot, overrides), services + staff checkboxes, resources, costs/margin, multi-service chains (on for all, q91), staff my-day, onboarding wizard, web E2E suite | done; E2E bug fixes in progress |
| 6 Zalo booking bot & inbox | salon OA connect, one webhook, rule-based bot, hand-off inbox, ZBS reminders, windows, funnel stats — against the emulator | done (real Zalo pilot is Step 12) |
| 7 Notifications, privacy & insights | staff bell + team email, Zalo-only customer messages (X26: no customer email), client export/erase, salon export, retention, Insights + metric registry | done; X26 in progress |
| 8 AI | price-list import (no PII), business assistant (PII firewall, Haiku-first, evals) | import done; assistant built, real-model evals wait for a key (q84 deferred); confirmed write actions (08 B) later |
| 9 Platform admin & pricing | admin panel, TOTP step-up, 2FA reset, suspension (bot + sends paused), audit retention; X25 pricing (Basic free first year, then 99k VND, no assistant in Basic); analytics + feature flags | admin done; X25 in progress; analytics/flags to do |
| 10 Payroll, commissions & owner profit | pay settings, commission per completed line, monthly payroll close, owner "This month" net profit (actual vs projected), staff own earnings | in progress |
| 11 GuGu Studio marketing site | photoreal story landing, book-style navigation, pricing copy (X25), SEO basics | landing merged; navigation/pricing pass in progress |
| 12 Production readiness & launch | AWS Singapore staging + prod, backups/restore drill, email provider (q86), real Zalo pilot (q81), media service, native dev builds + push + stores (q79), performance/a11y, full security review, legal sign-off | to do |

### Later (after a Vietnamese company and legal review)
Marketplace and customer side: search and salon pages (10), customer booking surface, reviews/moderation (11), attribution + commission ledger (12), map, Zalo Mini App (09 Z4), AI on Zalo chat (08 Z3), MCP server (08 D), multi-staff multi-service phase C (06), SMS (X12), payment gateway, passkeys + read-only impersonation (05 step 9 rest).

### Earlier plan (before the pivot)
The original 0–11 step plan assumed a customer marketplace in Step 6. It is superseded by the table above; see git history of this file for the old text.

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
