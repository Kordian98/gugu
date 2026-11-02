# Domain: AI business assistant

The salon-facing AI assistant ("GuGu Assistant") answers owners' and managers' questions about their own salon's bookings and results, in Vietnamese or English. It uses permission-checked tools over tenant-scoped read models behind a **PII firewall**: no personal data is ever sent to the LLM. Read this before changing the assistant module, the tool registry, or anything flagged `agentExposed`.

## Status
- **AI onboarding import (milestone IMP): implemented** on branch `ai/08-imp`, not merged yet. See "AI onboarding import" below.
- Chat assistant (A0–A4), confirmed writes (B), MCP (D): **not implemented**.

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
- Cost: reserve the worst case before the call (images × 1,600 + 2,000 input tokens, 16,000 output, at Sonnet prices × `AI_USD_TO_VND`), then commit the actual usage. One import is about 500–2,000 VND, so the Basic cap (20,000) covers several.
- Audit: `ai_import.extracted` / `ai_import.blocked` / `ai_import.confirmed`, with counts, tokens and cost only. No content.
- Confirm creates rows one by one through `CatalogService.create` (validation, audit, availability bump). On failure, earlier rows stay created.
- Tests: `pii-patterns.test.ts`, `price-list-extractor.test.ts`, `ai-import.pii.test.ts` (real OCR/faces, canaries never reach the gateway), `ai-import.int.test.ts` (HTTP, tenant isolation, permission, entitlement, atomic cap), `packages/domain/src/ai-import/review.test.ts`. QA screenshots: `docs/qa/08-imp/`.

## Admin Copilot
Owned by 12; reuses runtime, routing and firewall; salons as `salon_N` tokens. _TBD._

## Out of scope (needs personal data; only after legal review + explicit consent)
Review summaries, paste-from-Zalo parsing, Zalo chat agent / Zalo surface, reading notes or tags, personalised free-text messages, creating customers, images with people.

## Tool catalogue
| Tool | Domain | Kind | Permission | Entity types | Owner |
|---|---|---|---|---|---|
| `resolve_period` | assistant | read | — | — | ai-agent |
| `request_deeper_analysis` | assistant | read | — | — | ai-agent |
| _…_ | | | | | |

## Data model
_TBD._ `AssistantConversation`, `AssistantMessage`, `AssistantEntityToken`, `AssistantToolCall`, `AssistantActionProposal`, `AssistantUsage`.

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
- 2026-11-02: AI onboarding import implemented (branch ai/08-imp): no-PII gate, Sonnet extraction, review UI, interim Redis cost cap.
- 2026-11-02: owner answers q31/q32/q42/q62–q65 applied (Pro plan, hard cap, import on all plans, Admin Copilot).
- 2026-11-02: PO revision: PII firewall, Anthropic API default (Bedrock plan dropped), Haiku-first routing, `packages/contracts` (X3).
