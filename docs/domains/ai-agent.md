# Domain: AI business assistant

The salon-facing AI assistant ("GuGu Assistant") answers owners' and managers' questions about their own salon's bookings and results, in Vietnamese or English. It uses permission-checked tools over tenant-scoped read models behind a **PII firewall**: no personal data is ever sent to the LLM. Read this before changing the assistant module, the tool registry, or anything flagged `agentExposed`.

> Status: **not implemented**. Skeleton; sections are filled as code lands. Spec: `docs/tasks/08-ai-agent.md`.

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
  - `assistant.deep` = `claude-opus-5-5`, effort medium (entitled monthly review, offline judging)
- _TBD at A0 (ADR)._ Pre-router rules, escalation thresholds, caching layout, compaction.

## Out of scope (needs personal data)
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
- CRM panel: _TBD_
- MCP server (tokenized output): _TBD (phase D)_

## Quotas and cost
_TBD._ Entitlement keys (`assistant.enabled`, `assistant.deep`), budgets, usage job, routing share.

## Evals
_TBD._ How to run, thresholds (PII suite 100%), how to add canary cases.

## Changelog
- 2026-11-02: skeleton created.
- 2026-11-02: roadmap X1/X5/X7 applied.
- 2026-11-02: PO revision: PII firewall, Anthropic API default (Bedrock plan dropped), Haiku-first routing, `packages/contracts` (X3).
