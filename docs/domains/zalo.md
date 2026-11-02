# Zalo domain

The Zalo domain connects GuGu to Vietnam's main messaging app. It delivers booking notifications as ZBS Template Messages, connects salon Official Accounts, runs the CRM Zalo inbox, and provides the Zalo touchpoints that need no API (links, QR, snippets). Read this before changing anything under `apps/api/src/modules/zalo/` or `apps/app/features/crm-inbox/`. Spec: `docs/tasks/09-zalo.md`. Skill: `.claude/skills/zalo-integration/`.

> Status: **not implemented**. This is a skeleton; fill in each section as code lands.

## Phases and status
Constraint (2026-11-02): GuGu has no Vietnamese legal entity. See `docs/tasks/09-zalo.md` §2a.

| Phase | Feature | Needs entity | Status |
|---|---|---|---|
| Z0 | zalo.me buttons, snippets, QR, share links, personal-Zalo helpers | no | not started |
| ZR | Integration-ready: `ZaloClient` port, emulator in provider-sink, data model, flags, go-live runbook | no | not started |
| Z2a | Salon OA connection, webhooks, CRM inbox, free in-window replies | no | not started (pilot after spike S-Z1) |
| Z2b | Salon-branded templates via salon OA | — | **not planned** (q70): paid templates only from the central OA |
| Z3 | AI agent drafts / auto-reply on Zalo chat | no | **deferred**: PO policy, no personal data to LLMs |
| Z1 | Central/partner GuGu OA templates + Zalo OTP | **yes** or partner | blocked |
| — | Zalo Login | no (built), shown only with central OA | built in ZR, hidden (q28) |
| Z4 | Zalo Mini App | **yes** | not planned (q41) |

## Invariants
- Zalo is optional; every send has a non-Zalo fallback.
- No personal-account automation.
- Tenant is resolved from `oa_id`; webhooks are signed, acked within 5 s, and processed async and idempotently.
- Reply window enforced (OpenAPI ≤7 d, free ≤48 h; values from config).
- One template message per (entity, event, channel).
- Tokens are encrypted; no secrets, OTP codes or bodies in logs.
- No Zalo content or customer identity goes to any LLM. Agent tools are aggregate-only.
- Channel id `zalo_template` (X2). Acquisition sources come from the topic-12 enum (X6).
- Every send resolves a `ZaloSenderProfile`. Live vs emulated is selected by config only.

## Data model
_To be filled from the Prisma schema._ Planned: `ZaloSenderProfile`, `ZaloOaConnection`, `ZaloIdentity`, `ZaloConversation`, `ZaloMessage`, `ZaloTemplate`, `ZaloMessageLog`, `ChannelConsent`.

## Flows
_To be filled:_ template send, OA connect/refresh/reauth, webhook ingest, inbox reply, customer linking, agent draft/auto-reply.

## Templates
| eventKey | zaloTemplateId | locale | status |
|---|---|---|---|
| _none yet_ | | | |

## Configuration
_To be filled:_ `zalo.client = emulated|http|bsp`; feature flags (`zalo.templates`, `zalo.oa_inbox`, `zalo.salon_templates`, `zalo.otp`, `zalo.ai_autoreply`, `zalo.login`, `zalo.miniapp`), window thresholds, price table, test-phone allowlist, env vars.

## File map
_To be filled._

## Known limitations
- Zalo policies and prices change frequently. See `.claude/skills/zalo-integration/references/sources.md`.
- Phone number is not available from Zalo Login without a special permission.
- Some user-info APIs need a VN IP egress.
