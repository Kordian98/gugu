# 09 — Zalo integration

> Status: refined spec, rev. 2 (2026-11-02). Owner agent: `.claude/agents/zalo.md`. Skill: `.claude/skills/zalo-integration/`. Domain doc: `docs/domains/zalo.md`.
>
> **Rev. 2 constraint (PO decision, open-questions #1):** GuGu has **no Vietnamese legal entity** for now. Business validation comes first; an entity may come later. GuGu must still be **fully integration-ready**, so that turning Zalo on later is a config/credentials change, not a rebuild. See §2a for the paths that work without an entity, and §8 for the re-planned phases.
>
> **Cross-topic resolutions applied:**
> - **X2:** the notification channel id is `zalo_template` (ZBS Template Message). "ZNS" appears only as a historical alias in docs and search terms, never in code identifiers.
> - **X6:** booking/acquisition sources use the single enum owned by topic 12. Zalo maps to `zalo_link`, `zalo_chat`, `zalo_oa`, `zalo_mini_app`, plus `qr_code` and `ai_agent`; see R1.3 and §6.

Zalo is the main messaging app in Vietnam, and most salons already run their business through it. Many take bookings in **personal** Zalo chats and phone calls. Some have a **Zalo Official Account (OA)**. Customers expect confirmations and reminders on Zalo rather than by email. GuGu should plug into that habit instead of competing with it, but the core product MUST work without any Zalo integration.

---

## 1. Scope

### In
- **No-API Zalo touchpoints (MVP):** "Chat on Zalo" buttons, share-to-Zalo links, QR codes, and copyable vi/en message snippets from the CRM.
- **Integration-ready build (ZR):** the `ZaloClient` adapter, `ChannelProvider` implementations, a provider-sink emulator, the full data model, flags and a go-live runbook. This is all that ships without live Zalo.
- **ZBS Template Message** (the former ZNS, unified on 2026-01-01; channel id `zalo_template` per X2) as a notification channel for booking confirmation, reminders, changes, cancellations, review requests and OTP. It sends by phone number from a sender profile: a salon OA first (Z2b), a central/partner GuGu OA later (Z1, blocked without a VN entity).
- **Per-salon OA connection** (OAuth v4 OA permission) through the GuGu Zalo app.
- **Unified Zalo inbox in the CRM.** It is backed by OA webhooks, with replies sent as consultation messages.
- **Customer identity linking:** Zalo UID ↔ phone ↔ `CustomerSalonProfile`.
- **AI agent on Zalo conversations** (topic 08): **deferred**. PO policy forbids sending personal data to any LLM. Only aggregate Zalo metrics are exposed to the agent.
- **Zalo Login** for customers (optional sign-in method; not a replacement for phone OTP).
- **Zalo Mini App** (booking inside Zalo): later phase, needs an ADR.
- Consent, opt-out, auditing, cost metering and per-tenant billing hooks for paid messages.

### Out
- Automating **personal** Zalo accounts through unofficial libraries (zca-js, scraping, browser automation). This breaks Zalo's terms and risks account bans. It is forbidden.
- Zalo broadcast / marketing campaigns in MVP. Broadcast can only be sent from OA Manager on the web, not through the API, and is limited to 06:00–19:59.
- ZaloPay or any customer payment flow. Customers pay at the salon (master prompt §2).
- GMF group chat automation (possible later).

---

## 2. Gap analysis

| # | Gap / issue in master prompt | Decision |
|---|---|---|
| G1 | §16 says only "prepare optional integration with Zalo OA" and never explains how salons actually use Zalo. | Model the three real workflows: (a) personal Zalo plus phone, the majority; (b) salon with its own OA; (c) customer who never used the salon's Zalo. Design for all three, with (a) served by no-API features. |
| G2 | "ZNS" is outdated naming. From 2026-01-01 Zalo merged ZNS, UID Transaction and UID Broadcast into **ZBS Template Message**. Zalo Cloud Account was renamed **ZBS Account**. The old UID template formats stopped being supported on 2026-03-01. | Use ZBS Template Message terminology and APIs. Watch the developer changelog, which already has a later update (V261001). |
| G3 | No sender strategy: central GuGu OA or salon's own OA? | **Both, modelled as `ZaloSenderProfile`** (`central` \| `salon_oa` \| `partner_oa`), in phases. Rev. 2: with no VN entity, **salon-owned OAs come first** (Z2a/Z2b). The central GuGu OA (Z1) is switched on by config once an entity or partner exists. One GuGu Zalo App can serve many OAs. Paid sends need a ZBS Account linked to the sending OA. |
| G4 | No messaging-window rules. | Consultation replies through the OpenAPI are only possible **≤7 days** after the user's last interaction, and are free only **≤48 h**. Outside 7 days, send a template message (if one fits) or fall back to OA Manager, which allows 365 days, or another channel. The engine MUST check the window before sending. |
| G5 | Cost is not modelled. Template messages and out-of-window consultation messages cost money, and the prices change (the 2026 OA package model differs from 2025). | Meter every paid send per tenant (`ZaloMessageLog.costEstimate`). Prices live in config, never in code. Decide who pays (GuGu vs salon) per plan (topic 12). |
| G6 | OTP via Zalo is not mentioned. | ZBS OTP templates can be a cheaper OTP channel than SMS. Use them as a delivery option behind the OTP provider interface (topic 05), with SMS fallback. Rev. 2: OTP is a *platform* message, so it needs the central/partner OA and stays **disabled until Z1**. Topic 05 uses SMS via an aggregator. The adapter and emulator exist from ZR. |
| G7 | The CRM has no concept of "conversation". | Add conversation, thread and message entities (owned here; schema placeholders in topic 04). |
| G8 | Single-frontend rule vs Zalo Mini App. A Mini App is a Zalo-hosted React web app built with zmp-sdk and zmp-ui, so it is not an Expo target. | Treat the Mini App as a **separate thin channel client** that reuses `packages/api-client`, `validation`, `localization` and `domain`. This needs an ADR, because it is a deliberate exception to "one frontend". Deferred to Phase Z4. |
| G9 | No legal/consent model for Zalo messages. | Keep a consent record per customer per channel. Transactional templates rely on the booking relationship; promotional sends need explicit opt-in. Honour opt-out and Zalo's spam controls (Zalo throttles flows users find annoying). Personal-data handling follows topic 05 (PDPL / Decree 13). This is not a claim of legal compliance. |
| G10 | Webhook reliability is not specified. | Endpoints are HTTPS on a verified domain and MUST reply 200 within **5 s**. Verify the signature (HMAC-SHA256 with the app secret). Enqueue to BullMQ and process asynchronously. Make processing idempotent by event id. |
| G11 | Phone ↔ UID mapping. The Zalo UID is scoped per OA/app and is not the phone number. | Store a `ZaloIdentity` row per (OA or app, uid). Link it to a customer by verified phone only, never by guessing. |
| G12 | Zalo Login does not reliably return a phone number (it needs a special permission). | Zalo Login is a convenience login. Booking still requires a verified phone (master prompt §10), via OTP or a Zalo phone grant once approved. |
| G13 | Some OA APIs need a paid OA tier, and some user-info APIs need a Vietnamese IP. | Run the integration worker from a VN or SEA egress, or verify early. List the required OA tier in salon onboarding. |
| G14 | Official access largely requires a Vietnam-registered business. | **Answered: no VN entity for now.** The central GuGu OA (Z1) and the Mini App (Z4) are blocked. The salon-owned OA path (Z2a) and the emulated integration-ready build (ZR) do not need a GuGu entity. See §2a. |
| G15 | No plan for building and testing Zalo features without live Zalo access. | Add milestone **ZR "integration-ready"**: the adapter, an emulator in `provider-sink`, the full data model, feature flags and contract tests. Going live is then a config/credentials switch per path. |

---

## 2a. Paths without a GuGu Vietnamese entity (research 2026-11-02)

Facts are tagged **[official]** (oa.zalo.me / developers.zalo.me / miniapp.zaloplatforms.com) or **[3p]** (vendor, blog or SDK; unconfirmed).

| Path | Findings | Verdict |
|---|---|---|
| **(a) Foreign entity owns and verifies a GuGu OA plus a ZBS Account** | **[official]** OA verification has three routes: business registration name, a trademark protected by Vietnam's IP Office "trong lãnh thổ Việt Nam", or a trading name. It requires a verification letter (CVXT) and licences stamped by the issuing authority. The file must be submitted within 14 days of creating the OA, and review takes 2–3 working days. The representative ID field accepts "CMND/CCCD/Hộ chiếu", but foreign passports are not addressed. **[3p]** Verified OAs effectively require a VN business registration or a VN-protected trademark. Foreign citizens reportedly could not verify OAs as of 2024. Registration needs a +84 phone. Zalo business services are "available only to Vietnam-based companies" (Infobip). **[official]** Paid services, including ZBS Template Message, need a ZBS Account linked to both the OA and the App. | **Not realistic short-term.** The only theoretical route is registering the GuGu trademark in Vietnam (a long process, **[3p]** typically many months). Recommend starting a VN trademark filing in T-BIZ as cheap optionality. |
| **(b) Aggregator/BSP (Infobip, 8x8, eSMS, VietGuys, …)** | **[3p]** Infobip: "Only verified official accounts can communicate with end-users". ZNS is sent "from your Zalo Official Account", and you pay per successfully delivered message, with optional SMS failover. Template approval goes through the BSP's account manager. Integrations (Netcore via Infobip) need "Zalo OA ID(s), API key, pre-approved templates". eSMS divides OAs into unverified (ads only, no business licence) and verified (needs a business licence). Indicative prices are ~200 VND transactional and ~300 VND promotional (8x8). **No BSP was found that lends a shared OA to a foreign sender.** | **A BSP does not remove the need for a verified OA owner.** It only simplifies billing, contracting (possibly a foreign contract with the BSP) and SMS failover. It is useful later as the `zalo_template` provider *implementation* (Infobip/eSMS adapter vs direct Zalo). Keep the provider pluggable. |
| **(c) Salon-owned OAs connected via OAuth** | **[official]** OA, App and ZBS admins are *personal Zalo users*, not companies. Creating an App asks for name, category, description, then phone, email, icon and domain to activate it. The App gets permission from an OA via authorization ("cấp quyền cho ứng dụng"). Zalo charges nothing for OA integration itself. One ZBS Account can link multiple OAs and Apps. **[official]** Consultation messages are free ≤48 h after the user's last interaction (OpenAPI ≤7 d). **[3p]** Activated apps can only call APIs that have been reviewed or approved. Webhooks need a verified domain and HTTPS. Some user-info calls need a VN IP. **No source found requiring a VN entity to create an App or obtain OA permissions from third-party OAs.** It remains unverified whether GuGu's App can be linked to a *salon's* ZBS Account, because the linker must be admin of both. | **Reachable first, without an entity.** Salons are VN businesses (many hộ kinh doanh with a business licence) and can own verified OAs. GuGu provides the App (created by a team member's personal Zalo account), inbox, webhooks and free in-window replies. Templates from a salon's OA are billed to the salon's ZBS Account (Z2b, pending verification). |
| **(d) Zalo Login for a foreign-owned app** | **[3p]** App creation plus Login config (Android hash key / package, iOS bundle id, PKCE) is self-serve in the developer dashboard. Nothing found requiring a VN entity. The phone number is not returned without a special permission. | **Likely reachable**, to be confirmed by spike S-Z1. Low value until phone access exists, because booking still needs phone OTP. |
| **(e) Zalo Mini App** | **[official blog]** Owner verification is mandatory for every Mini App. A business verifies via its business OA or a business licence plus the legal representative's ID. Conditional industries need extra licences. | **Blocked** until there is an entity (or a partner owner). Stays Z4. |
| **(f) VN partner owns the central OA on GuGu's behalf** | **[3p]** Foreign brands commonly operate through a local distributor/partner who verifies the OA. You need a written agreement on admin access and on ownership of followers and history. | Possible bridge for Z1. It is a business/legal decision (T-BIZ), not an engineering one. The architecture supports it via `ZaloSenderProfile` (§4). |

**Consequences:**
1. Z0 is maximised and ships in MVP.
2. ZR (integration-ready, fully emulated) is built alongside the CRM.
3. Z2a, a salon-OA inbox with free replies, is the first live path, piloted with 1–3 salons that already have verified OAs.
4. Z2b templates via salon OAs follow.
5. Z1 (central OA), Zalo OTP and Z4 wait for an entity or a partner and are switched on by config.

---

## 3. Refined requirements

### R1 — No-API touchpoints (Phase Z0, MVP)
1. The salon profile has an optional `zaloPhone` and `zaloOaId`. The public profile shows a "Nhắn Zalo" button that opens `https://zalo.me/<phone>` or the OA link.
2. CRM customer card: a "Message on Zalo" action opens `zalo.me/<customerPhone>` on web and native. The opening is recorded as a manual touchpoint, with no content stored.
3. CRM snippets: one-tap copy of localized messages (booking confirmation, reminder, reschedule offer, booking link). The booking link is always `gugu.vn/{locale}/salon/{slug}?src=zalo_link` or a short link. It resolves to acquisition source **`zalo_link`** (X6 enum, owned by topic 12).
4. QR code generator for the salon's booking link (`?src=qr_code` → source **`qr_code`**). It can be printed at the counter and posted in the salon's Zalo profile or groups.
4a. **Personal-Zalo workflow helpers (Z0+, maximised because Z1 is blocked):**
    - "Booked via Zalo chat" quick-entry in the CRM booking sheet, which sets source **`zalo_chat`** for bookings a receptionist enters from a personal-Zalo conversation.
    - A "send confirmation via Zalo" action after any booking, which opens `zalo.me/<phone>` with the localized confirmation snippet on the clipboard.
    - A daily "tomorrow's reminders" list in Today, with one tap per customer (open Zalo plus copy the reminder) and a "reminded" checkmark. This replaces automated reminders for salons without an OA.
    - Salon-profile fields for their OA link and personal Zalo phone.
5. Share sheet (native) and share URL (web) produce correct Open Graph previews inside Zalo chat (depends on topic 10).

### RZR — Integration-ready (Phase ZR, no live Zalo needed)
1. **`ZaloClient` port** (TypeScript interface) with methods: `oauth.authorizeUrl/exchange/refresh`, `oa.sendConsultation`, `oa.getProfile`, `oa.listFollowers`, `templates.send`, `templates.status`, `webhook.verify`. Implementations:
   - `HttpZaloClient`: direct Zalo APIs, built against the docs and fixtures.
   - `EmulatedZaloClient`: talks to `provider-sink`.
   - (later) `BspZaloClient`: Infobip/eSMS. Only the template-send part; inbox stays direct.
   Selected per environment by config.
2. **`ChannelProvider` implementations** `zalo_template` and `zalo_cs`, registered with topic 11's channel registry. They are disabled by default (flags) and appear in channel fallback order only when the flag is on and a usable sender profile exists.
3. **Emulator in `provider-sink`** (topic 13 owns the service; Zalo owns the Zalo routes):
   - fake OAuth consent page and token endpoint, with an expiring token and refresh rotation;
   - `POST` template-send and consultation-send capture, inspectable at `/zalo/outbox`;
   - a webhook emitter that sends signed events (`follow`, `user_send_text`, `user_send_image`, `user_click_link`, …) to the API from a UI or CLI;
   - a configurable window clock, plus error modes (expired token, quota, template not approved, 5xx, slow response).
4. **Data model complete** (via topic 04): `ZaloSenderProfile`, `ZaloOaConnection`, `ZaloIdentity`, `ZaloConversation`, `ZaloMessage`, `ZaloTemplate`, `ZaloMessageLog`, `ChannelConsent`. Migrations are applied even while every flag is off.
5. **Config-only switch-on:** going live on a path = set secrets (`ZALO_APP_ID`, `ZALO_APP_SECRET`, webhook secret), set `zalo.client=http`, register templates, enable the flag(s). No code change. A runbook `docs/runbooks/zalo-go-live.md` lists the steps per path.
6. **Admin readiness screen** (topic 12 admin) shows, per path, whether App credentials, a verified domain, sender profiles, approved templates and flags are in place, and what blocks each path.
7. **Contract tests** run the same scenarios against `EmulatedZaloClient` (CI) and, when credentials exist, against a sandbox/test OA (manual job).

### R2 — Template messages via central (or partner) GuGu OA (Phase Z1 — **blocked: no VN entity**; code ready in ZR)
1. Implements the `NotificationChannel` interface from topic 11 as the `zalo_template` provider. Topic 11's orchestrator picks the channel order; the default for VN customers is push → zalo_template → SMS → email.
2. Template registry: `ZaloTemplate` (Zalo templateId, our event key, locale, params schema, approval status, tag). Params are validated with Zod before sending. Templates are authored in vi first.
3. Events: booking_created, booking_confirmed, booking_rescheduled, booking_cancelled, reminder_24h, reminder_2h, review_request, otp.
4. One message per transaction per template type (Zalo rule). The dedup key is `(bookingId, eventKey, channel)`.
5. Use the sandbox / dev mode when testing. In non-prod environments, send only to an allowlist of test phones.
6. Delivery status is polled or received by webhook and stored. A failure triggers the next channel in the fallback order.

### R3 — Salon OA connection (Phase Z2a — **first live path, no GuGu entity needed**; Z2b for salon-billed templates)
1. Onboarding step "Kết nối Zalo OA": OAuth v4 OA permission flow (PKCE). Store access and refresh tokens encrypted (KMS/envelope). Refresh proactively in a BullMQ job. On revocation or refresh failure, mark the connection `needs_reauth` and notify the owner.
2. A webhook receiver maps events (follow, unfollow, user_send_text/image/file/location/sticker, user_click_button/link, user_received/seen) to the tenant via `oa_id`. Events from an unknown `oa_id` are dropped and logged.
3. OA menu / CTA deep link "Đặt lịch" opens GuGu booking (web URL, or app if installed), carrying `src=zalo_oa`. Acquisition source is **`zalo_oa`**.
4. **(Z2b)** Optional per-salon template messages under the salon's own OA brand (`ZaloSenderProfile.kind = salon_oa`). Paid from the **salon's ZBS Account**, which must be linked to the GuGu App. The onboarding wizard guides the salon admin through this. GuGu meters the sends (`ZaloMessageLog`) but does not pay. Feasibility of linking a third party's App to a salon's ZBS Account is verified in spike S-Z2.
5. Pilot requirement: Z2a goes live with 1–3 salons that already have a **verified** OA. Unverified OAs can connect, but GuGu shows a limitations notice.

### R4 — Unified inbox in CRM (Phase Z2)
1. Inbox list: conversations sorted by last activity, with unread count, customer match (linked/unlinked), and a window indicator: "free reply ≤48h", "reply ≤7d", "closed: send template / open Zalo".
2. Conversation view: messages, an attached customer card (upcoming bookings, notes, no-show history), and quick actions: send booking link, propose slots (from the availability API, topic 06), create booking (opens a prefilled booking sheet), and link to customer.
3. Linking an unknown Zalo user to a customer: the receptionist confirms the match by phone. Automatic linking happens only when a phone is verified (e.g., booking via OA CTA with an OTP-verified phone).
4. Permissions: owner, manager and receptionist can read and reply; staff can only see conversations assigned to them (topic 05 matrix). Every outbound message records the actor.
5. Supported content: text and image. Stickers are shown as placeholders. Files are limited by size and type (topic 04 media).

### R4a — Booking-source trust (response to topic 06's refinement)
| Source | Who creates it | Trust | Status at creation |
|---|---|---|---|
| `zalo_link` | customer self-service on GuGu, phone OTP-verified | verified | normal flow (per salon auto-confirm setting) |
| `zalo_oa` | customer taps the OA "Đặt lịch" CTA → **GuGu booking flow with OTP-verified phone** | verified | normal flow. **Not a draft** (rejects 06's proposal for this source). |
| `zalo_mini_app` | customer in the Mini App | verified **only if** phone is verified (OTP or approved phone grant); otherwise draft | conditional |
| `zalo_chat` | **authenticated salon staff** entering a booking from a Zalo conversation | staff-confirmed; customer phone unverified | confirmed by the creating staff member (same as `staff_created`). No second confirmation is needed, but the customer's identity is marked unverified. |
| `ai_agent` | the product agent | draft | **requires human confirmation**. Agrees with 06. On Zalo it is deferred anyway (R5). |

### R5 — AI agent on Zalo (Phase Z3 — **DEFERRED by PO policy, 2026-11-02**)
**Policy:** no personal data may be sent to any LLM. Zalo customer messages, names, phones and UIDs are personal data. Until the policy changes:
1. No Zalo message content, customer identity or conversation metadata is passed to an LLM: no drafts, no auto-replies, no summaries, no classification.
2. The only Zalo data the product agent may see is **aggregate, non-personal** metrics (see §6).
3. Design notes for when the policy changes (not to be built now): draft-first, an allowlisted auto-reply, no booking confirmation without an engine hold, inbound text treated as untrusted, and every AI-sent message labelled and audited. This is to be re-specified together with topic 08 and the legal review.

### R6 — Zalo Login (Phase Z2/Z4)
1. OAuth v4 social login with PKCE. On first login, the user still verifies a phone (OTP) before booking.
2. Link it to an existing account via verified phone. Never merge accounts silently.

### R7 — Zalo Mini App (Phase Z4, ADR required)
1. A thin booking client inside Zalo: browse salon, pick service, staff, slot, book. It uses the same API and packages.
2. Use a phone grant (when approved) to skip OTP, if the policy allows it. Confirm with the security owner (topic 05).
3. One GuGu Mini App, not one per salon. Salon deep links go through Mini App params.

### R8 — Cross-cutting
- Feature-flagged per environment and per salon (`zalo.templates`, `zalo.oa_inbox`, `zalo.ai_autoreply`, `zalo.miniapp`).
- All Zalo calls go through one `ZaloClient` adapter with retries and backoff, rate-limit handling, structured logs (no message bodies at info level), and Sentry breadcrumbs.
- Kill switch: disabling Zalo globally degrades to the other channels with no user-visible errors.
- All templates and snippets are in vi and en (topic 03). vi is the default and the only locale Zalo templates require initially.

---

## 4. Proposed technical approach

- **NestJS module `zalo`** (in `apps/api/src/modules/zalo/`), split as:
  - `client/`: the `ZaloClient` port plus `HttpZaloClient` (OA OpenAPI v3, OAuth v4, ZBS template API) and `EmulatedZaloClient` (provider-sink). A `BspZaloClient` for template sends may follow. All Zalo knowledge stays here.
  - `senders/`: `ZaloSenderProfile` resolution. Rules: a salon-scoped message uses the salon's OA if one is connected and the event is allowed, then the central/partner OA if enabled, otherwise no Zalo channel.
  - `connections/`: OA connections, token vault, refresh job.
  - `webhooks/`: controller that verifies the signature, enqueues and acks within 5 s.
  - `inbox/`: conversations, messages, window calculation, linking.
  - `templates/`: registry, param validation, send, status.
  - `channel/`: the `zalo_template` and `zalo_cs` implementations of topic 11's `NotificationChannel`.
- **Queues (BullMQ):** `zalo-webhook-in`, `zalo-send`, `zalo-token-refresh`, `zalo-status-sync`. Sends are idempotent by `dedupKey`.
- **Window engine:** a pure function `replyWindow(lastUserInteractionAt, now) → free | paid_api | manager_only`, unit-tested and with thresholds in config.
- **Data (placeholders handed to topic 04):** `ZaloSenderProfile` (kind `central|salon_oa|partner_oa`, oaId, zbsLinked, allowed event keys, status), `ZaloOaConnection`, `ZaloIdentity`, `ZaloConversation`, `ZaloMessage`, `ZaloTemplate`, `ZaloMessageLog` (send attempts, cost, status), `ChannelConsent`. All tenant-owned rows carry `salonId`; the central-OA rows carry `salonId = null` plus a `platform` scope.
- **Security:** tokens encrypted at rest; webhook signature check plus `oa_id` → tenant resolution; no Zalo secrets in the client apps; SSRF-safe media download for inbound images (rehost to S3 via the media service).
- **Frontend:** inbox screens in `apps/app/features/crm-inbox/`. The window badge and quick actions are shared components. `zalo.me` links use `Linking.openURL` on native and `<a target=_blank>` on web.
- **Emulator:** Zalo routes in `provider-sink` (topic 13 service) mirror real request/response shapes from `references/api-notes.md`. Every emulated route is covered by a contract test, so drift from real Zalo shows up at the first live run.
- **Config:** `zalo.client = emulated|http|bsp`, flags `zalo.templates`, `zalo.oa_inbox`, `zalo.salon_templates`, `zalo.otp`, `zalo.ai_autoreply`, `zalo.login`, `zalo.miniapp`. All flags are off in production until their path's go-live checklist passes.
- **Mini App (later):** `apps/zalo-miniapp/` with zmp-cli, zmp-sdk and zmp-ui, importing shared packages only. Covered by an ADR.

---

## 5. Acceptance criteria

- **Z0:** From the CRM customer card, "Message on Zalo" opens a Zalo chat with that phone on iOS, Android and web. The QR code points to the salon booking URL with `src` attribution. Snippets are copyable in vi and en, with no hardcoded strings.
- **ZR:** With `zalo.client=emulated`, the full suite passes in CI:
  - salon OA connect → token refresh → reauth;
  - emulator webhook → inbox message → in-window reply captured at `/zalo/outbox`;
  - a template send captured with validated params;
  - dedup on retry;
  - a two-salon isolation test.
- **ZR:** Switching any path live requires **no code change**: only secrets, config and flags, documented in `docs/runbooks/zalo-go-live.md`. Verified by flipping `zalo.client` between `emulated` and a stubbed `http` with the same tests.
- **ZR:** With all Zalo flags off (prod default), no Zalo UI beyond Z0 is visible and no Zalo channel appears in the fallback order.
- **Z1:** A booking created in GuGu, for a customer whose phone has Zalo, triggers exactly one approved `booking_confirmed` template. Retrying the job sends nothing new (dedup verified by test). With Zalo disabled, the SMS or push fallback fires.
- **Z1:** Template params failing the Zod schema are rejected before any API call, and the failure is logged with the template key.
- **Z1:** A Zalo OTP delivers the code; the OTP code is never logged; SMS fallback fires within the configured timeout.
- **Z2:** An OA connect / disconnect / reauth cycle works. Revoked tokens put the connection into `needs_reauth` and the owner is notified.
- **Z2:** The webhook endpoint replies within 5 s under load. A forged signature is rejected (403). Duplicate events are processed once.
- **Z2:** An inbound message appears in the right salon's inbox only. A tenant-isolation test with two salons passes.
- **Z2:** Replying after 7 days through the API is blocked in the UI and the backend, with a clear alternative offered.
- **Privacy (PO policy):** a test asserts that no Zalo message text, customer name, phone or UID reaches the LLM gateway (topic 08). Only `zalo.messagingStats` and `zalo.integrationStatus` are registered as agent tools.
- **Z3:** deferred; acceptance criteria to be written when the no-personal-data-to-LLM policy changes.
- Every outbound Zalo message has an audit row: actor (user, system or agent), tenant, template or cs, cost estimate, status.

---

## 6. Product AI-agent surface (for topic 08)

PO policy (2026-11-02): **no personal data to any LLM.** The Zalo surface is therefore limited to aggregates. There are no conversation, message, customer or send tools.

| Tool | R/W | Permission | Input → Output | Notes |
|---|---|---|---|---|
| `zalo.messagingStats` | R | analytics.read | `{from, to}` → counts (inbound/outbound, conversations opened), median first-response time, template sends by event, cost estimate | aggregates only; no names, phones, UIDs or text; small-count suppression (k ≥ 5) for any breakdown |
| `zalo.integrationStatus` | R | settings.read | `{}` → connected OA (display name), sender-profile status, flags, needs_reauth | salon-level config only |

Deferred until the policy changes: `listConversations`, `getConversation`, `replyWindow`, `draftReply`, `sendReply`, `sendBookingLink`, `linkCustomer`.

---

## 7. Dependencies

- **04:** schema placeholders listed in §4, plus encrypted-secret column support.
- **05:** OTP provider interface, RBAC for inbox, webhook auth, token vault, PDPL handling.
- **06:** availability lookup and holds for slot suggestions and booking from chat.
- **07:** inbox UI inside the CRM IA; customer card; snippets location.
- **08:** registers only the aggregate Zalo tools (§6). The LLM gateway enforces the no-personal-data policy. Z3 is deferred.
- **10:** OG previews for links shared in Zalo; short links.
- **11:** `NotificationChannel` abstraction, orchestration, dedup, preferences.
- **12:** owns the X6 source enum (Zalo uses `zalo_link`, `zalo_chat`, `zalo_oa`, `zalo_mini_app`, `qr_code`, `ai_agent`) and its `gugu_acquired` vs `salon_acquired` mapping; per-plan cost allocation; feature flags; admin readiness screen.
- **13:** the `provider-sink` service hosts the Zalo emulator routes; VN/SEA egress for workers; secrets management; webhook domain verification in deploy; go-live runbook.
- **T-BIZ:** Zalo personal accounts (+84) for the GuGu App admins; optional VN trademark filing; partner/BSP conversations; salon pilot recruitment.
- **03:** vi/en snippets and template copy.

---

## 8. Sub-milestones

Re-planned for the "no VN entity" constraint. **Bold** marks what ships without an entity.

| Order | Milestone | Needs entity? | Contents |
|---|---|---|---|
| 1 | **Z0.1** | no | Salon Zalo fields, "Nhắn Zalo" button, CRM "Message on Zalo" |
| 2 | **Z0.2** | no | Snippets, QR, share links with X6 attribution (`zalo_link`, `qr_code`) |
| 3 | **Z0.3** | no | Personal-Zalo helpers (R1.4a): `zalo_chat` quick entry, confirm-via-Zalo, Today reminders list |
| 4 | **ZR.1** | no | Data model + `ZaloClient` port + `EmulatedZaloClient` + provider-sink Zalo routes |
| 5 | **ZR.2** | no | OA connect flow, token vault, refresh job, webhook ingest, window engine (all vs emulator) |
| 6 | **ZR.3** | no | CRM inbox UI + linking + quick actions (vs emulator); `zalo_template`/`zalo_cs` channels behind flags |
| 7 | **ZR.4** | no | Go-live runbook, admin readiness screen, contract tests. **Milestone "integration-ready" = ZR.1–ZR.4 done.** |
| 8 | **S-Z1 spike** | no | Team member creates the GuGu Zalo App with a personal Zalo account, verifies the domain, connects a friendly salon's verified OA, receives a real webhook, sends an in-window reply. Also checks Zalo Login app setup. Result recorded in an ADR. |
| 9 | **Z2a** | no | Live pilot with 1–3 salons that own verified OAs: inbox + free in-window replies + OA "Đặt lịch" CTA (`zalo_oa`) |
| 10 | **S-Z2 spike → Z2b** | no (salon pays) | Link GuGu App to a salon's ZBS Account; salon-branded templates billed to the salon |
| 11 | Z3 (**deferred**) | no | AI on Zalo chat is blocked by the PO policy (no personal data to LLMs). Only aggregate agent tools ship (§6). |
| 12 | Z1 | **yes** (or partner OA) | Central/partner OA + ZBS Account; GuGu-branded templates for every customer; Zalo OTP |
| 13 | Z4.1–Z4.3 | **yes** (Mini App owner verification) | ADR Mini App → Mini App booking MVP; Zalo Login if the spike shows value |

---

## 9. AI-first deliverables

- `.claude/agents/zalo.md`: domain subagent owning `apps/api/src/modules/zalo/**`, `apps/app/features/crm-inbox/**`, and later `apps/zalo-miniapp/**`.
- `.claude/skills/zalo-integration/SKILL.md` with `references/api-notes.md` (endpoints, windows, rules) and `references/sources.md` (official links to re-verify).
- `docs/domains/zalo.md`: durable domain doc, filled in as code lands.
- ADRs to write: `ADR central-vs-salon-OA`, `ADR zalo-mini-app-exception`, `ADR channel-fallback-order`.
- Test fixtures: recorded webhook payloads (sanitized) in `apps/api/test/fixtures/zalo/`, for agent-driven development without live access. Until real payloads exist, fixtures are derived from docs and marked `synthetic: true`. Replace them after S-Z1.
- `docs/runbooks/zalo-go-live.md`: per-path go-live checklist (central, salon OA, partner OA, BSP).
- ADR to write: `ADR zalo-without-vn-entity`, recording the §2a findings and the phase order.

---

## 10. Open questions for the product owner

1. ~~Is there a VN legal entity?~~ **Answered 2026-11-02 (open-questions #1): no, validate first.** → Z1, Zalo OTP and Mini App are blocked; salon-OA path first.
2. Who pays for template messages? *Partly answered by the constraint:* on the salon-OA path (Z2b) the salon's own ZBS Account pays. Who pays on a future central/partner OA path is still open (open-questions #33).
2a. Central GuGu OA from day one (open-questions #28)? → **No** (blocked by #1). Zalo Login in MVP → only if spike S-Z1 confirms setup works without an entity and phone access is obtainable; default **no**.
2b. Should GuGu file a **Vietnamese trademark** now, as cheap optionality for OA verification route 2? (T-BIZ)
2c. Is a **VN partner holding a central OA** (route f) acceptable before the entity exists, or should Z1 wait for the entity?
2d. Can we recruit 1–3 pilot salons that already have a verified OA, for S-Z1/Z2a?
3. Should reminders go through Zalo by default for every customer, or only after an explicit Zalo opt-in on first booking?
4. Is AI auto-reply on Zalo a paid-plan-only feature (topic 12)?
5. Is a Zalo Mini App a priority for launch, or post-PMF? It costs a second client (ADR exception).
6. Target salons: what share use an OA today vs personal Zalo only? This decides how much to invest in Z2 vs Z0. A field survey is recommended.

---

## Sources (re-verify before implementation — Zalo changes policy often)
- OA message types (effective 2026-01-01): https://oa.zalo.me/home/documents/guides/tong-quan-cac-loai-tin-nhan-tren-zalo-official-account-_3651713298729094511
- ZBS Template Message: https://oa.zalo.me/home/documents/guides/zbs-template-message
- ZBS launch / migration changelog (V251209): https://developers.zalo.me/changelog/thong-bao-ra-mat-zbs-template-message-va-lo-trinh-chuyen-doi-7814
- ZBS launch news: https://zalo.solutions/news/thong-bao-ra-mat-zbs-template-message-giai-phap-tin-nhan-doanh-nghiep-theo-mau/cp1zx4bq8mzhhszgz0br1ocd
- OA send policy / fees: https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099
- OA packages 2026 (third-party, unverified): https://oazbs.vn/zalo-zbs/zalo-oa-co-mat-phi-khong-bang-gia-va-chi-phi-van-hanh-can-biet/
- Infobip Zalo docs (template limits, 400 chars, 1 msg/transaction): https://www.infobip.com/docs/zalo
- Community OA API notes (webhook 5 s, HMAC, VN IP): https://github.com/PhucMPham/zalo-agent-cli/wiki/Official-Account-(VN)
- Zalo Mini App starter (booking flow reference): https://github.com/Zalo-MiniApp/zaui-restaurant
- Mini App docs: https://miniapp.zaloplatforms.com/documents/
- OA verification guide (official): https://oa.zalo.me/home/documents/guides/huong-dan-xac-thuc_70
- App creation & OA permission (official): https://oa.zalo.me/home/documents/guides/Khoi-tao-ung-dung-va-cap-quyen_117071366476220195
- Extension policy (VN business + IT industry codes required, official): https://oa.zalo.me/home/documents/policy/phat-trien-tien-ich-extension
- Mini App owner verification (official blog): https://miniapp.zaloplatforms.com/blog/huong-dan-xac-thuc-zalo-mini-app-doi-voi-cac-nhom-nganh-dac-thu/
- Infobip Zalo overview (3p): https://cdn-web.infobip.com/uploads/markdown-exports/www.infobip.com/zalo.md
- eSMS OA types (3p): https://helpcenter.esms.vn/thong-tin-dich-vu/tra-cuu-thong-tin-ho-so/zalo/zalo-oa/quy-trinh-tao-zalo-oa
- Foreign businesses & partners (3p): https://mwyconsulting.com/insights/vietnam-digital-advertising/zalo-for-business-vietnam, https://prodima.vn/en/what-is-zalo/
