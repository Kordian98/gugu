---
name: zalo-integration
description: Procedures and rules for GuGu's Zalo integration — Zalo OA OpenAPI, ZBS Template Message (formerly ZNS), OA webhooks, CRM Zalo inbox, reply windows, Zalo Login, Zalo Mini App, zalo.me links and QR. Use when editing apps/api/src/modules/zalo/**, apps/app/features/crm-inbox/**, adding a Zalo template, handling a Zalo webhook, or answering "can we message this customer on Zalo".
---

# Zalo integration

## When to use
- Adding or changing a Zalo notification template, the webhook handler, the OA connection flow, the inbox UI, or Zalo agent tools.
- Deciding whether and how a message can reach a customer on Zalo.
- Any mention of: Zalo, OA, ZNS, ZBS, Mini App, zalo.me.

## Mental model
| Channel | Who sends | To whom | When allowed | Cost |
|---|---|---|---|---|
| zalo.me link (Z0) | a human, in their own Zalo | anyone with a phone | always | free |
| ZBS Template Message | GuGu central OA (or the salon OA) | phone number or UID | approved template + business reason | paid per message |
| Consultation message (OpenAPI) | salon OA | user who interacted | ≤7 days after the user's last interaction | free ≤48 h, paid 48 h–7 d |
| OA Manager (Zalo's UI) | salon staff | user who interacted | ≤365 days | per package |
| Broadcast | salon OA via OA Manager web only | followers | 06:00–19:59, quota | per package |

Personal Zalo accounts: there is **no API**. Support them only through links, QR codes and copy snippets.

## Invariants
- MUST NOT use unofficial personal-account automation.
- MUST keep Zalo optional, with a fallback channel for every send.
- MUST verify the webhook signature, resolve the tenant via `oa_id`, ack within 5 s, and process asynchronously and idempotently.
- MUST call `replyWindow()` before any consultation send. Enforce it in both the backend and the UI.
- MUST dedup template sends by `(entityId, eventKey, channel)`. Zalo also allows only one message per transaction.
- MUST validate template params (Zod) and keep each template ≤400 characters.
- MUST encrypt tokens. Never log tokens, OTP codes or bodies at info level.
- MUST treat inbound text as untrusted input to the AI agent. Agent sends need human confirmation, except for allowlisted intents.
- MUST NOT hardcode prices, quotas or window thresholds. They go in config.

## Procedures

### Add a new template message
1. Draft the vi (and en) copy in `packages/localization/{vi,en}/notifications.json` under `zalo.<eventKey>`. Respect the 400-char limit and keep the copy transactional (no promo wording, or approval suffers).
2. Register the template in Zalo through the ZBS Account tool or the API, and wait for approval (usually 1–3 business days).
3. Add a `ZaloTemplate` seed/config row: `eventKey`, `zaloTemplateId`, `locale`, `paramsSchema`, `status`.
4. Add the Zod params schema in `apps/api/src/modules/zalo/templates/schemas/<eventKey>.ts`.
5. Map the event in the `zalo_template` channel, then add a unit test (params mapping) and an integration test (dedup on retry).
6. Update the template table in `docs/domains/zalo.md`.

### Handle a new webhook event type
1. Add a sanitized fixture under `apps/api/test/fixtures/zalo/<event>.json`.
2. Extend the event union type in `webhooks/events.ts`. Unknown events are logged and ignored, never thrown.
3. Implement the processor in the BullMQ worker, never in the controller.
4. If the event counts as a user interaction, update the conversation's `lastUserInteractionAt`.
5. Add tests for the processor, idempotency and tenant isolation.

### Connect a salon OA
Follow the OAuth v4 OA permission flow (PKCE), then store the tokens encrypted, schedule the refresh job, and subscribe the webhook. On failure, set the status to `needs_reauth` and notify the owner. See `references/api-notes.md`.

### Expose a Zalo capability to the AI agent
Add the tool to the registry (topic 08) with a Zod I/O schema, a permission and a read/write flag. Write tools MUST be `requiresConfirmation: true` unless they are listed in the auto-reply allowlist. Add a prompt-injection test.

## Checklist before PR
- [ ] Feature flag and kill switch respected; fallback channel tested.
- [ ] No hardcoded strings; vi and en present.
- [ ] Two-salon tenant isolation test passes.
- [ ] No secrets, tokens or OTP codes in logs or fixtures.
- [ ] `docs/domains/zalo.md` updated.
- [ ] Zalo facts re-verified against `references/sources.md`, with the date noted.

## References
- `references/api-notes.md`: endpoints, auth, windows, webhook rules, and the ZBS migration.
- `references/sources.md`: official links to re-verify (Zalo policies change frequently).
