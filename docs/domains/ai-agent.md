# Domain: AI business assistant

The salon-facing AI assistant ("GuGu Assistant") answers owners' and managers' questions about their own salon's bookings and results, in Vietnamese or English. It uses permission-checked tools over tenant-scoped read models behind a **PII firewall**: no personal data is ever sent to the LLM. Read this before changing the assistant module, the tool registry, or anything flagged `agentExposed`.

## Status
- **AI onboarding import (milestone IMP): implemented** on branch `ai/08-imp`, not merged yet. See "AI onboarding import" below.
- AI onboarding import (IMP): **implemented** (on main).
- Chat assistant **A1 + A2: implemented** on branch `ai/08-assistant`: five read tools, PII firewall, runtime with Haiku-first routing and streaming, floating-bubble UI. See "Chat assistant (A1/A2)" below.
- Not implemented: A0 registry generation from 04/07 registries (they don't exist yet; tools are hand-written), A3 eval suite with real-model graders, A4 breadth, confirmed writes (B), MCP (D), conversation history UI.

Spec: `docs/tasks/08-ai-agent.md`.

## Owner
Subagent `ai-agent` (`.claude/agents/ai-agent.md`). Procedure: skill `agent-tool`.

## File map
| Path | Purpose |
|---|---|
| `apps/api/src/modules/assistant/` | Runtime: loop, routing, streaming, re-hydration, quotas, proposals |
| `apps/api/src/modules/assistant/llm/` | `LlmClientFactory` (Anthropic adapter; config switch for later) |
| `packages/agent-tools/` | Registry, generator from read models/metrics, PII firewall (scrubber, vault, allowlist check, egress check) |
| `packages/contracts/assistant/` | Zod schemas for tools and API, `pii-free.ts` field types |
| `apps/api/src/modules/<domain>/agent-tools.ts` | Domain description overrides + write proposals |
| `apps/app/features/assistant/` | CRM chat panel (entity chips, mask preview, source chips) |
| `apps/api/src/modules/ai-import/`, `apps/app/features/ai-import/` | AI onboarding import (see below) |
| `evals/assistant/` | Fixture with canaries, quality cases, PII suite, graders |

## Invariants
- No personal data or free text to the LLM: aggregates, enums, numbers, dates and per-conversation tokens only.
- The tool-result allowlist check and the request egress check are blocking.
- User input is scrubbed (directory names → tokens, phone/email → redactions).
- Re-hydration happens after the model call, for the authorised viewer only, and never over MCP.
- Assistant tables store the tokenized transcript only.
- Tenant/actor only from `ToolContext`. Permission per tool, re-checked at execution and at re-hydration.
- Every tool call audited (`AssistantToolCall`, incl. firewall result).
- Writes = `ActionProposal` (tokens/enums/times) + confirmation + normal endpoint.
- Business numbers only from `MetricCatalog`; money labelled with `RevenueKind`.
- Registries layered: 04 read models → 07 metrics → 08 generated tools.
- Privacy regime: PDPL 91/2025/QH15 + Decree 356/2025/ND-CP; no compliance claim.

## Model and request configuration
- Provider: Anthropic API (`LLM_PROVIDER=anthropic`).
- Routes (planned defaults, tuned by evals):
  - `assistant.fast` = `claude-haiku-5-5`, effort low (default)
  - `assistant.standard` = `claude-sonnet-5-5`, effort medium (escalation)
  - `assistant.deep` = `claude-opus-5-5`, effort medium (Pro monthly review, offline judging)
- _TBD at A0 (ADR)._ Pre-router rules, escalation thresholds, caching layout, compaction.

## Plans and cost
- Pro/Ultra: chat assistant (`ai.agent.enabled`) + monthly Opus review (`ai.monthly_review`). Every plan: AI onboarding import (`ai.onboarding_import`).
- Hard monthly cost cap per salon (reserve → refuse → settle); 80% forces `fast`; one cap for all AI features incl. import; platform daily kill switch. Values: q73.

## AI onboarding import
Photos or screenshots of a price list become reviewed services. Every plan (`ai.onboarding_import`), counted against the hard cap `ai.monthly_cost_cap_vnd`. ADR: `docs/adr/0009-ai-import-pii-gate.md`.

| Path | Purpose |
|---|---|
| `packages/contracts/src/ai-import/ai-import.ts` | Draft/status/extract/confirm schemas, error codes, limits (10 images × 10 MB) |
| `packages/domain/src/ai-import/review.ts` | Draft → editable review row → `ServiceInput` (pure, tested) |
| `apps/api/src/modules/ai-import/http/ai-import.controller.ts` | `GET /salons/:id/ai-import` (status), `POST …/extract` (multipart `images`), `POST …/confirm` |
| `…/application/ai-import.service.ts` | Validate, then rate limit, gate each image, reserve cost, one Claude call, commit cost, audit |
| `…/application/ai-cost-meter.ts` | `AiCostMeter` port + interim Redis hard cap (TODO(12): swap for `UsageService`) |
| `…/pii/image-gate.ts` | Strip metadata, then face reject/mask, OCR redaction, re-OCR egress check |
| `…/pii/pii-patterns.ts`, `redaction-plan.ts` | Phone/email/URL/handle/"honorific + Name" matching mapped to word boxes |
| `…/pii/ocr-engine.ts`, `face-detector.ts` | Tesseract vie+eng (WASM), UltraFace ONNX (`apps/api/assets/models/`) |
| `…/llm/price-list-extractor.ts`, `models.ts` | Sonnet 5.5, strict `record_price_list` tool, adaptive thinking (medium), `fallbacks: "default"`; prices and routes |
| `apps/app/features/ai-import/` | Banner, then picker (expo-image-picker, downscaled to 2000 px on device), then review table, then save |

Flow and rules:
- No `ANTHROPIC_API_KEY` means `configured: false`: the UI says "not configured" and `extract` returns 503 `ai_import.not_configured` without processing.
- Errors: `ai_import.invalid_upload` (400); `image_unreadable`, `person_detected` and `pii_check_failed` (422, `errors[0].path = "images.N"`); `entitlement.quota_exceeded` (429, cap); `common.rate_limited` (429, 20/h per salon); `ai_import.extraction_failed` (502; a billed call still commits its cost).
- Cost: each provider attempt reserves the worst case (images × 1,600 + 2,000 input tokens, 16,000 output, at Sonnet prices × `AI_USD_TO_VND`) on the counter of the month it was taken in (`CostReservation.monthKey`, so a reservation made at 23:59 settles in that month; counters never go below 0). How each attempt settles:
  - Success: commit the actual usage.
  - Unusable answer (refusal, no tool call): commit the actual usage.
  - Request may have been billed (timeout, abort, dropped connection, 5xx/529): commit the **reserved worst case**.
  - Request provably not billed (connection refused/DNS before sending, or a 4xx rejection): release.
  - Retries: the SDK's own retries are off (`maxRetries: 0`). `AiImportService` makes at most 2 attempts, each metered separately, and retries only connection errors, timeouts, 429 and 5xx. Classification lives in `llm/provider-errors.ts`.
  - One import costs about 500–2,000 VND, so the Basic cap (20,000) covers several.
- Audit: `ai_import.extracted` / `ai_import.blocked` / `ai_import.confirmed`, with counts, tokens and cost only. No content.
- Confirm creates rows one by one through `CatalogService.create` (validation, audit, availability bump). On failure, earlier rows stay created.
- Tests: `pii-patterns.test.ts`, `price-list-extractor.test.ts`, `ai-import.pii.test.ts` (real OCR/faces, canaries never reach the gateway), `ai-import.int.test.ts` (HTTP, tenant isolation, permission, entitlement, atomic cap), `packages/domain/src/ai-import/review.test.ts`. QA screenshots: `docs/qa/08-imp/`.

## Admin Copilot
Owned by 12; reuses runtime, routing and firewall; salons as `salon_N` tokens. _TBD._

## Out of scope (needs personal data; only after legal review + explicit consent)
Review summaries, paste-from-Zalo parsing, Zalo chat agent / Zalo surface, reading notes or tags, personalised free-text messages, creating customers, images with people.

## Tool catalogue
| Tool | Kind | Permission | Output (PII-free) |
|---|---|---|---|
| `resolve_period` | read | `assistant.use` | enum expression → salon-local `from`/`to` (ISO weeks, UTC+7) |
| `bookings_count` | read | `bookings.read` | total + groups by status / `staff_N` / `service_N` / day |
| `revenue_summary` | read | `analytics.read` | one row per `RevenueKind`; `reported_by_salon` = `not_tracked` |
| `utilization` | read | `analytics.read` | booked ÷ scheduled minutes (after breaks/time off), salon + per `staff_N` |
| `bookings_list` | read | `bookings.read` | ≤ 50 rows: `booking_N`, local ISO times, status, source, `staff_N`, `service_N`[], price |
| `request_deeper_analysis` | control | — | Haiku route only: re-runs the turn on Sonnet |

Customer data is not reachable through any tool.

## Data model
_TBD._ `AssistantConversation`, `AssistantMessage`, `AssistantEntityToken`, `AssistantToolCall`, `AssistantActionProposal`, `AssistantUsage`.

## Chat assistant (A1/A2)
| Path | Purpose |
|---|---|
| `packages/contracts/src/assistant/pii-free.ts` | Token kinds/regex, PII-free field types, enum allowlist, `isPiiFreeString` |
| `packages/contracts/src/assistant/assistant.ts` | Status, turn input, SSE event union, error codes |
| `packages/domain/src/assistant/` | `resolvePeriod`, `utilization` (pure, tested) |
| `apps/api/src/modules/assistant/firewall/` | `names` (diacritic-insensitive matching), `scrubber` (input), `token-vault` (per-conversation tokens in DB), `allowlist` (tool results), `rehydrate` (streamed output) |
| `…/tools/` | `read-tools.ts` (definitions, strict JSON schemas, Zod in/out), `read-queries.ts` (tenant-scoped Prisma) |
| `…/application/assistant.service.ts` | Turn loop: scrub → model ⇄ tools → re-hydrate; egress check, metering, audit, persistence |
| `…/application/routing.ts`, `prompt.ts`, `directory.ts` | Routes, frozen system prompt, names directory + display names |
| `…/llm/assistant-llm.ts` | `AssistantLlm` port; Anthropic streaming adapter (shared client from ai-import, `maxRetries: 0`) |
| `…/http/assistant.controller.ts` | `GET /salons/:id/assistant` (status), `POST …/assistant/turns` (SSE) |
| `apps/app/features/assistant/` | `AssistantDock` (bubble + panel), `AssistantPanel`, `ChatView`, `data.ts` (`apiStream` client) |

Rules as built:
- **Gating:** `POST turns` needs `assistant.use` (owner, manager) and `ai.agent.enabled` (Pro/Ultra/trial). Without a key it returns 503 `assistant.not_configured`. The bubble shows only for members with `assistant.use`. On plans without the assistant the panel shows the Pro upgrade prompt (CTA goes to Settings).
- **Input scrubbing:** staff names become `staff_N`, customer names `[redacted_name]`, the salon name `[salon]`, contact details `[redacted_phone|email|link]`. Single-word **staff** names match when capitalised **or** after a cue word (anh/chị/em/KTV/nhân viên…). Single-word **customer and salon** names need a capital **and** a cue ("khách Hoa"), because customers pick their own booking names. Directory names that equal fixed vocabulary (statuses, sources, revenue kinds, period expressions, placeholders) or look like tokens are dropped (`isFixedVocabulary`). The masked text is sent back as the `masked` event and shown under the user's message, with staff as `@Name`.
- **Egress check:** once per turn, over the **scrubbed user-typed text only**: contact details or directory names mean 422 `assistant.privacy_blocked` and nothing is sent. Server-made content (context line, tool results) is not scanned; it is fixed vocabulary protected by the allowlist. Scanning it let a customer block the assistant by booking as "Vietnamese" or "Confirmed" (security review, fixed on `ai/08-assistant-fix`).
- **Allowlist:** every tool result is validated against its strict Zod output, and every string must be a token, an ISO date/time or a registered enum. Otherwise it is withheld: `{"error":"result_withheld"}`, audit status `withheld`, error log `pii_firewall_block`.
- **Routing:**
  - The pre-router sends long (> 280 chars) or comparative questions to Sonnet 5.5 (effort medium, 4,096 max tokens, `fallbacks: "default"`). Everything else goes to Haiku 5.5 (effort low, 2,048 max tokens).
  - The Haiku route also gets `request_deeper_analysis`. A Haiku refusal re-runs the turn on Sonnet.
  - At most 6 model calls per turn.
- **Caching:** frozen system prompt with `cache_control`; tools are sorted deterministically. The date and reply language go in the user turn as a separate first text block.
- **Cost:** each call reserves the worst case on the hard cap `ai.monthly_cost_cap_vnd` and settles like AI import (actual / worst case / release by provider-error class). At the cap the turn ends with an `error` event `entitlement.quota_exceeded` and no model call.
- **Rate limit:** 60 turns/hour per member per salon.
- **Storage:** `assistant_conversations`, `assistant_messages` (tokenized, as sent/returned, thinking blocks kept), `assistant_entity_tokens` (token → entity id, never names) and `assistant_tool_calls` (audit: input, status, sha256 digest of output, latency).
- **Display names** respect permissions: without `members.read`, staff show as "Staff #3". Bookings show as `#REFCODE`, services by their name in the current locale.
- **Tests:**
  - `firewall/firewall.test.ts`: folding, cues, scrubber, allowlist, re-hydration across chunks, routing.
  - `packages/domain/src/assistant/assistant.test.ts`: periods incl. month/year and UTC+7 edges; utilisation.
  - `assistant.int.test.ts`: SSE turn with a recording fake LLM; the canary suite (staff, customer, salon name, phone, note never in any request; reference codes stay server-side); revenue by kind; escalation and refusal fallback; permission, tenant and plan refusals; conversation-id isolation; the cap; not configured.
- **QA screenshots:** `docs/qa/08-a2/`.

## Surfaces
- CRM panel: floating bottom-right bubble on every business page; opens a desktop side sheet or a mobile full-height sheet above the tab bar. Basic sees the bubble with an upgrade prompt. Must not cover 07's mobile "+" button. _Built in A2._
- MCP server (tokenized output): _TBD (phase D)_

## Quotas and cost
_TBD._ Cost-cap ledger, usage job, routing share.

## Evals
_TBD._ How to run, thresholds (PII suite 100%), how to add canary cases.

## Changelog
- 2026-11-02: skeleton created.
- 2026-11-02: roadmap X1/X5/X7 applied.
- 2026-11-03: egress check limited to scrubbed user text; strict single-word customer names; fixed-vocabulary filter (security review).
- 2026-11-03: A1 + A2 (branch ai/08-assistant): read tools, PII firewall, streaming runtime, floating bubble UI.
- 2026-11-02: security-review fixes: month key stored on reservations, counters clamped at 0, provider failures settled by billing class, metered own retries (branch ai/08-imp-fix).
- 2026-11-02: AI onboarding import implemented (branch ai/08-imp): no-PII gate, Sonnet extraction, review UI, interim Redis cost cap.
- 2026-11-02: owner answers q31/q32/q42/q62–q65 applied (Pro plan, hard cap, import on all plans, Admin Copilot).
- 2026-11-02: PO revision: PII firewall, Anthropic API default (Bedrock plan dropped), Haiku-first routing, `packages/contracts` (X3).
