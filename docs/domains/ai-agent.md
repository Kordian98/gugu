# Domain: AI business assistant

The salon-facing AI assistant ("GuGu Assistant") answers owners' and managers' questions about their own salon's bookings and results, in Vietnamese or English, using permission-checked tools over tenant-scoped read models. Read this before changing the assistant module, the tool registry, or any domain's `agent-tools.ts`.

> Status: **not implemented**. Skeleton — sections are filled as code lands. Spec: `docs/tasks/08-ai-agent.md`.

## Owner
Subagent `ai-agent` (`.claude/agents/ai-agent.md`). Tool procedure: skill `agent-tool`.

## File map
| Path | Purpose |
|---|---|
| `apps/api/src/modules/assistant/` | Runtime: conversation loop, streaming, quotas, proposals |
| `packages/agent-tools/` | `ToolDefinition`, `ToolContext`, registry, untrusted-text helpers |
| `apps/api/src/modules/<domain>/agent-tools.ts` | Domain tool contributions |
| `apps/app/features/assistant/` | CRM chat panel (web side sheet, native bottom sheet) |
| `evals/assistant/` | Fixture dataset, cases, graders |

## Invariants
- Tenant/actor only from `ToolContext`, never from model output.
- Every tool has a permission; tool list filtered per role; re-checked on execution.
- Every tool call audited (`AssistantToolCall`).
- Writes = `ActionProposal` + human confirmation + normal endpoint.
- Untrusted text wrapped; no phone/email to the model.
- Business numbers only from `MetricCatalog`.

## Model and request configuration
_TBD at A0 (ADR)._ Model, effort per route, caching layout, fallbacks, compaction.

## Tool catalogue
| Tool | Domain | Kind | Permission | PII level | Owner |
|---|---|---|---|---|---|
| `resolve_period` | assistant | read | — | none | ai-agent |
| _…_ | | | | | |

## Data model
_TBD._ `AssistantConversation`, `AssistantMessage`, `AssistantToolCall`, `AssistantActionProposal`, `AssistantUsage`.

## Surfaces
- CRM panel — _TBD_
- Zalo OA — _TBD (phase C)_
- MCP server — _TBD (phase D)_

## Quotas and cost
_TBD._ Entitlement keys, budgets, usage aggregation job.

## Evals
_TBD._ How to run, thresholds, how to add cases.

## Changelog
- 2026-11-02 — skeleton created.
