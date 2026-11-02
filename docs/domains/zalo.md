# Zalo domain

The Zalo domain lets a salon's customers book **inside the salon's own Zalo Official Account** (roadmap X24). It covers connecting the OA, one signed webhook for all OAs, a rule-based booking bot (no LLM), staff hand-off in GuGu Studio, confirmations and 24 h / 2 h reminders, the 48 h / 7 d send windows, quotas, and a send log with cost. Read this before changing `apps/api/src/modules/zalo/**`, `apps/app/features/salon-crm/pages/ZaloInboxScreen.tsx` or `…/settings/ZaloSection.tsx`. Spec: `docs/tasks/09-zalo.md` (X24 overrides conflicting parts). Skill: `.claude/skills/zalo-integration/`.

## Status
Implemented on branch `zalo/09-impl` (2026-11-02). It runs end to end against the **built-in emulator**. Real Zalo is **not verified**: there is no GuGu Zalo App yet (q81), so `HttpZaloClient` is built from documentation only. Going live is config only (`docs/runbooks/zalo-go-live.md`).

| Area | State |
|---|---|
| Integration-ready layer (ZaloClient port, emulator, config switch, runbook) | done |
| Salon OA connection (OAuth v4 + PKCE, encrypted tokens, refresh, needs_reauth, reconnect, disconnect) | done |
| Webhook (signature, freshness, route by OA id, idempotent store, BullMQ) | done |
| Booking bot (service → variant → staff/any → 7-day slots → phone → confirm; my bookings, cancel, reschedule; hand-off) | done |
| Panel: Settings → Zalo, Zalo inbox (take over / hand back / reply), notifications | done (minimal UI) |
| Reminders 24 h / 2 h, salon-made booking changes (confirmed / cancelled / moved) | done |
| Windows (48 h free / 7 d paid / closed), monthly template cap, send log with cost | done |
| Real Zalo (`ZALO_CLIENT=http`) | built, unverified (spike S-Z1 after q81) |
| AI on Zalo chat (Z3), Mini App, Zalo Login for customers | not planned now (X10, q41, X21/X23) |

## Invariants
- The bot always speaks **as the salon**; copy never mentions GuGu. It never links to our website. Customers have no account (X21/X23); records belong to one salon.
- Customer messages are personal data and are **never sent to an LLM** (X10). The bot is rule-based.
- Every webhook must pass four checks before any processing:
  - signature check: `X-ZEvent-Signature` = SHA-256 of appId + body + timestamp + OA secret key;
  - fresher than 5 minutes;
  - routed by OA id;
  - stored once (`event_key`).
- Every send goes through `OutboundService`:
  - it writes a chat row and a send-log row (status, tier, cost);
  - it is idempotent on `dedup_key`;
  - the window, quota and connection are checked **at send time** in the worker.
- Disconnecting wipes the tokens and rejects queued sends. Events of a disconnected OA are dropped.
- Zalo refresh tokens are single-use, so refresh is single-flight (Redis lock) and re-reads the row first.
- Booking writes only through the booking engine facade (`BookingsEngineModule`). The bot acts as `customer` with source `zalo_oa`, idempotent per inbound event.

## Data model (migration `20261102143451_add_zalo`)
| Table | Purpose |
|---|---|
| `zalo_oa_connections` | One per salon. Holds the OA id and name, status (`connected`, `needs_reauth`, `disconnected`), encrypted tokens, bot, reminder and paid-message toggles, template ids, and the monthly template cap. |
| `zalo_conversations` | One per (OA, Zalo user). Holds the display name, shared phone, `mode` (`bot` or `staff`), bot state (JSON), last user interaction (drives windows) and unread count. |
| `zalo_messages` | Chat history (inbound customer; outbound bot, staff or system) |
| `zalo_webhook_events` | Verified raw events, idempotent; purged after 30 days |
| `zalo_send_logs` | One row per outbound send: channel (`cs` or `template`), purpose, tier (`free`, `paid` or `template`), status, cost estimate, attempts, error. |
| `zalo_booking_links` | Booking ↔ conversation, plus the customer's attendance confirmation. Covers bot bookings and staff bookings whose phone matches exactly one conversation. |
| `zalo_staff_notifications` | Hand-off requests, bot booking changes, reauth needed |

## Flows
1. **Connect:**
   1. Settings → Zalo → "Kết nối Zalo OA" calls `POST /zalo/connection/start`, which stores the state and PKCE verifier in Redis for 10 min.
   2. The owner approves on Zalo's consent page (or the emulator's).
   3. `GET /api/v1/integrations/zalo/oauth/callback` exchanges the token and calls `getOa`.
   4. The connection is upserted; a P2002 conflict becomes `oa_in_use`.
   5. The browser goes back to `/{locale}/business/settings?section=zalo&zalo=<result>`.
2. **Inbound:**
   1. `POST /api/v1/integrations/zalo/webhook` verifies the event, stores it and enqueues job `zalo.inbound`.
   2. The worker locks the conversation row (`FOR NO KEY UPDATE`), stores the message and updates the window timestamp.
   3. In bot mode it runs `runBot()` and records the replies in the same transaction.
   4. Job `zalo.send` sends the replies as one ordered batch.
3. **Bot:** a pure state machine (`domain/bot/engine.ts`) over `BotPorts` (`application/bot-ports.ts`).
   - Button payloads:
     - `gg|<seq>|<i>`: option `i` of reply `seq`; a stale tap re-shows the current step.
     - `gg|g|menu|book|mine|staff`: global commands.
     - `gg|b|confirm|cancel|resched|<bookingId>`: booking actions.
   - Typed numbers, `HH:MM` and keywords (`đặt lịch`, `nhân viên`, `menu`, …) also work.
   - A flow resets after 30 minutes of silence.
4. **Hand-off:** "Gặp nhân viên", or a failure the bot can't handle, sets `mode=staff` and creates a notification. A staff reply (`POST …/messages`) also takes the conversation over. "Trả lại cho trợ lý" resets the bot.
5. **Reminders / updates:** job `zalo.minute` runs every 60 s and:
   - links staff bookings by phone;
   - sends due 24 h / 2 h reminders: a chat message with "Tôi sẽ đến / Đổi giờ / Hủy" buttons inside 7 days, otherwise the ZBS template `booking_reminder`;
   - reads `booking.*` outbox events with its own cursor and tells customers about changes the salon made.
6. **Tokens:** refreshed when less than 10 min is left; a 10-min job also refreshes tokens expiring within 1 h. On `token_invalid`: one forced refresh, then `needs_reauth` plus a notification.

## Configuration
| Variable | Meaning |
|---|---|
| `ZALO_CLIENT` | `emulated` (default outside production; forbidden in production) / `http` / `disabled` (production default) |
| `API_PUBLIC_URL` | Origin of this API: OAuth `redirect_uri`, emulator pages, emulator webhook target |
| `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_SECRET_KEY`, `ZALO_TOKEN_KEY` | Required for `http` (boot fails otherwise) |
| `ZALO_PRICE_TEMPLATE_VND` (200), `ZALO_PRICE_CS_PAID_VND` (55) | Indicative prices for the send log |
| Entitlements | `zalo.oa_connect` (connect), `zalo.inbox` (inbox), `zalo_template.monthly_messages` (template cap, lowered by the owner's cap) |
| Permissions | `integrations.zalo.manage` (owner: connect, settings, send log), `zalo.inbox.use` (owner, manager, receptionist) |

Salons register their ZBS templates at Zalo with exactly these parameters: `customer_name`, `booking_code`, `service_name`, `booking_time`, `salon_name`.

## Run locally
1. Run `pnpm stack:up` and `pnpm db:migrate`, then start the API and the worker with `DEV_WORKER=1 pnpm dev:api`. `ZALO_CLIENT` defaults to `emulated`.
2. In GuGu Studio: Settings → Zalo → **Kết nối Zalo OA** → the emulator's consent page → **Allow**.
3. Click **Mở trình giả lập chat** (`/api/v1/dev/zalo-emulator?oa=<oaId>`) and chat as a customer: follow, type "xin chào", tap the buttons, share a phone, confirm. The booking appears in the calendar. The fault buttons simulate 503s and expired tokens.
4. Watch the inbox at `/{locale}/business/zalo`.
5. Run the integration tests with `pnpm --filter @gugu/api test:integration -- src/modules/zalo`. Stop your dev worker first: it shares Redis and the DB and would race the tests.

## File map
- `apps/api/src/modules/zalo/`:
  - `domain/`: `window.ts` (48 h / 7 d), `signature.ts`, and `bot/` (`engine.ts`, `payload.ts`, `types.ts`), each with unit tests.
  - `client/`: `zalo-client.ts` (port, errors) and `http-zalo-client.ts` (real Zalo).
  - `emulator/`: `emulated-zalo-client.ts`, `emulator-store.ts` (Redis `zalo-emu:*`), `emulator.controller.ts`, `emulator-pages.ts`.
  - `application/`: `connection.service.ts`, `webhook-ingest.service.ts`, `inbound.service.ts`, `bot-ports.ts`, `outbound.service.ts`, `reminders.service.ts`, `booking-updates.service.ts`, `inbox.service.ts`, `usage.queries.ts`, `zalo-jobs.ts`.
  - `http/`: `zalo-panel.controller.ts` (`/salons/:salonId/zalo/*`) and `zalo-webhook.controller.ts`.
  - Integration test: `zalo.int.test.ts`.
- Jobs: `apps/api/src/jobs/zalo.processor.ts`.
- Contracts: `packages/contracts/src/zalo/zalo.ts`.
- Copy: `packages/localization/locales/{vi,en}/zalo.json` (`bot.*`, `panel.*`).
- App: `features/salon-crm/data/zalo.ts`, `pages/settings/ZaloSection.tsx`, `pages/ZaloInboxScreen.tsx`, and the route `app/[locale]/(business)/business/zalo.tsx`.
- QA screenshots: `docs/qa/09-zalo/`.

## Known limitations
- Real Zalo behaviour comes from documentation and SDKs, not a live OA, and must be verified in spike S-Z1. That covers endpoints, payload shapes, error codes, the webhook signature formula and button postbacks (`oa.query.hide` arriving as `user_send_text`). Only `http-zalo-client.ts` and `webhook-ingest.service.ts` should need changes.
- Whether ZBS template buttons can post back to the OA chat is unverified. Reminders inside the 7-day window use chat buttons; template reminders rely on the template's own buttons and typed replies.
- The bot speaks Vietnamese only. The `en` copy exists, but there is no per-salon bot language setting yet.
- The booking-events cursor reads the outbox with a 30 s lag until the shared relay (04-S5) exists.
- Events are locked per conversation, so two taps processed in parallel run one after the other. Their order follows lock acquisition, not the Zalo timestamp.
- Integration tests and a running dev worker share Redis and the DB. Stop the worker before running the tests.
- Who pays for templates sent from salon OAs is open (q83). Sends are metered and capped.
