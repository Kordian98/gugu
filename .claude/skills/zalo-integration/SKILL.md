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

## Current constraint: no GuGu VN entity
| Path | Status | Sender profile |
|---|---|---|
| Z0 links/snippets/QR | live in MVP | none |
| ZR emulated build | default in dev/CI | `EmulatedZaloClient` |
| Z2a salon OA inbox + free replies | first live path (pilot) | `salon_oa` |
| Z2b salon-branded templates | after spike S-Z2; salon's ZBS Account pays | `salon_oa` |
| Z1 central/partner OA, Zalo OTP | **blocked** (entity or partner) | `central` / `partner_oa` |
| Z4 Mini App | **blocked** (owner verification) | n/a |

Always resolve a `ZaloSenderProfile`. No code may assume a central OA exists.

## Naming and attribution (cross-topic)
- Channel ids: `zalo_template` (template messages, X2) and `zalo_cs` (consultation replies). "ZNS" is only an alias in prose.
- Acquisition sources (X6, enum owned by topic 12):

  | Source | Assigned when |
  |---|---|
  | `zalo_link` | snippet or share link |
  | `qr_code` | QR |
  | `zalo_chat` | receptionist entry from a Zalo conversation |
  | `zalo_oa` | OA menu/CTA |
  | `zalo_mini_app` | Mini App |
  | `ai_agent` | agent-created booking (a draft that needs human confirmation) |

## Invariants
- MUST NOT use unofficial personal-account automation.
- MUST keep Zalo optional, with a fallback channel for every send.
- MUST verify the webhook signature, resolve the tenant via `oa_id`, ack within 5 s, and process asynchronously and idempotently.
- MUST call `replyWindow()` before any consultation send. Enforce it in both the backend and the UI.
- MUST dedup template sends by `(entityId, eventKey, channel)`. Zalo also allows only one message per transaction.
- MUST validate template params (Zod) and keep each template ≤400 characters.
- MUST encrypt tokens. Never log tokens, OTP codes or bodies at info level.
- MUST NOT pass Zalo content or customer identity to any LLM (PO policy). Only aggregate agent tools are allowed. AI drafts and auto-replies (Z3) are deferred.
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

### Develop against the emulator (default)
1. Run the stack via the `run-locally` skill. `provider-sink` exposes the Zalo routes, and `zalo.client=emulated` in `.env.local`.
2. Trigger inbound events from the provider-sink UI or CLI. Inspect outbound sends at `/zalo/outbox`.
3. Simulate the window clock and error modes (expired token, template not approved, 5xx, >5 s).
4. Any new `ZaloClient` call gets: an emulator route, a contract test, and a request/response shape in `references/api-notes.md`.

### Go live on a path
Follow `docs/runbooks/zalo-go-live.md`: secrets, `zalo.client=http`, domain verification, sender profile, approved templates, flag on. If a code change seems needed, stop and treat it as a ZR bug.

### Connect a salon OA
Follow the OAuth v4 OA permission flow (PKCE), then store the tokens encrypted, schedule the refresh job, and subscribe the webhook. On failure, set the status to `needs_reauth` and notify the owner. See `references/api-notes.md`.

### Expose a Zalo capability to the AI agent
Only aggregate, non-personal outputs are allowed (counts, timings, costs, config status, with k ≥ 5 suppression on breakdowns). No message text, names, phones or UIDs. Use the `agent-tool` skill, and add a test asserting that the output contains no personal fields. Anything else waits for the policy change.

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
