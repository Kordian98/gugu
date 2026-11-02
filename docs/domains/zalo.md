# Zalo domain

The Zalo domain connects GuGu to Vietnam's main messaging app. It delivers booking notifications as ZBS Template Messages, connects salon Official Accounts, runs the CRM Zalo inbox, and provides the Zalo touchpoints that need no API (links, QR, snippets). Read this before changing anything under `apps/api/src/modules/zalo/` or `apps/app/features/crm-inbox/`. Spec: `docs/tasks/09-zalo.md`. Skill: `.claude/skills/zalo-integration/`.

> Status: **not implemented**. This is a skeleton; fill in each section as code lands.

## Phases and status
| Phase | Feature | Status |
|---|---|---|
| Z0 | zalo.me buttons, snippets, QR, share links | not started |
| Z1 | ZBS Template Messages via central GuGu OA (+ OTP) | not started (blocked: VN entity, ZBS Account) |
| Z2 | Salon OA connection, webhooks, CRM inbox | not started |
| Z3 | AI agent drafts, then guarded auto-reply | not started |
| Z4 | Zalo Mini App, Zalo Login | not started (ADR pending) |

## Invariants
- Zalo is optional; every send has a non-Zalo fallback.
- No personal-account automation.
- Tenant is resolved from `oa_id`; webhooks are signed, acked within 5 s, and processed async and idempotently.
- Reply window enforced (OpenAPI ≤7 d, free ≤48 h; values from config).
- One template message per (entity, event, channel).
- Tokens are encrypted; no secrets, OTP codes or bodies in logs.
- Inbound text is untrusted for the AI agent.

## Data model
_To be filled from the Prisma schema._ Planned: `ZaloOaConnection`, `ZaloIdentity`, `ZaloConversation`, `ZaloMessage`, `ZaloTemplate`, `ZaloMessageLog`, `ChannelConsent`.

## Flows
_To be filled:_ template send, OA connect/refresh/reauth, webhook ingest, inbox reply, customer linking, agent draft/auto-reply.

## Templates
| eventKey | zaloTemplateId | locale | status |
|---|---|---|---|
| _none yet_ | | | |

## Configuration
_To be filled:_ feature flags (`zalo.templates`, `zalo.oa_inbox`, `zalo.ai_autoreply`, `zalo.miniapp`), window thresholds, price table, test-phone allowlist, env vars.

## File map
_To be filled._

## Known limitations
- Zalo policies and prices change frequently. See `.claude/skills/zalo-integration/references/sources.md`.
- Phone number is not available from Zalo Login without a special permission.
- Some user-info APIs need a VN IP egress.
