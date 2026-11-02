---
name: agent-tool
description: Expose salon data to the in-product GuGu AI assistant (and MCP server) or add an assistant tool — PII-free field types, entity tokens, agentExposed read models/metrics, permission, tenant scoping, firewall tests, eval and PII-canary cases. Use whenever editing apps/api/src/modules/*/agent-tools.ts, packages/agent-tools, packages/contracts/assistant, or flagging a read model or metric agentExposed.
---

# Expose data to the AI assistant

The salon AI assistant reads data only through tools in `packages/agent-tools`. **Hard rule: no personal data ever reaches the LLM.** Tools return aggregates, enums, numbers, dates and per-conversation entity tokens (`staff_3`, `customer_17`, `service_5`, `booking_892`). The server re-hydrates tokens to names for the authorised viewer after the model call. Spec: `docs/tasks/08-ai-agent.md` §4.3–4.4.

Registries are layered (X7):
1. 04 read-model registry: query, permission, tenant scope, per-field PII classification.
2. 07 `MetricCatalog` in `packages/domain/metrics`.
3. 08 tools, **generated** from entries flagged `agentExposed`.

Hand-write a tool only for helpers or write-action proposals. Zod schemas live in `packages/contracts/assistant` (X3).

## When to use
- A domain spec lists a "Product AI-agent surface".
- You flag a read model or metric `agentExposed`, or change one that already is.
- You add a helper or write-proposal tool, or review an `agent-tools.ts` diff.

## Invariants
- Outputs MUST use only PII-free field types from `packages/contracts/assistant/pii-free.ts`: `entityToken`, `metricId`, `revenueKind`, global enums, `int`, `decimal`, `money`, `isoDate`, `isoDateTime`, `duration`, `boolean`, `percent`. **There is no free `string` type.**
- MUST NOT expose:
  - names of customers or staff;
  - phone numbers, emails, addresses of people;
  - notes, tags, review text, chat or Zalo messages;
  - salon-entered free text (service names travel as `service_N` + category enum);
  - photos of people.
- Entity references MUST be `entityToken`s issued by `ctx.tokenVault`. Never output raw DB ids.
- Entity inputs MUST be `entityToken`s, resolved through `ctx.tokenVault` (a token from another conversation fails).
- MUST take tenant/actor only from `ToolContext`. No `salonId`/`userId` in inputs.
- MUST call the domain service, never Prisma directly.
- MUST declare `permission` (05 matrix) and `kind`. Write tools: `confirmation: "required"`, return an `ActionProposal` with token/enum/time payload only, and never draft free text to customers (template enum instead).
- Business numbers MUST come from `MetricCatalog`. Money MUST carry `RevenueKind` (`estimated_from_bookings` | `recorded_offline_sale` | `reported_by_salon`) and MUST NOT be summed across kinds unlabelled (X5).
- Dates are ISO ranges in `ctx.timezone`; relative periods go through `resolve_period`.
- Admin Copilot tools (12) follow the same rules; salons are `salon_N` tokens.
- Inputs: Zod `.strict()`, tool registered with `strict: true`. Outputs compact: aggregates or ≤ 50 rows + cursor.

## Procedure
0. **Check the rule first.** If answering needs any personal data or free text, stop: the feature is out of scope (spec §1), and lifting that needs a legal review plus explicit consent (spec §4.11). Raise it with the orchestrator instead of working around the firewall.
1. **Prefer generation.**
   - Classify every field of the read model (04) or metric (07) in its registry entry: `pii: none | personal | freeText`.
   - Set `agentExposed: true`.
   - The generator maps entity references to tokens and drops non-allowlisted fields. The build fails if a field the tool needs is not PII-free.
   - Add a description override in the domain's `agent-tools.ts`, then go to step 6.
2. **Hand-written tools only** (helpers, write proposals): name `<domain>_<verb_or_noun>` snake_case; check `packages/agent-tools/src/registry.ts` for collisions.
3. **Description** (English, model-facing): what it returns, when to use it and when not, units, limits. Say that entities are tokens. Include vi synonyms ("lịch hẹn = booking"). 1–4 sentences.
4. **Schemas** in `packages/contracts/assistant/<domain>.ts`, using only PII-free types; entity args as `entityToken`.
5. **Handler** `(ctx, input) => output`: resolve tokens via `ctx.tokenVault`, call the domain service with `ctx.salonId`, and issue tokens for returned entities. Map errors to `ToolError` (`not_found`, `forbidden`, `invalid_input`, `unavailable`). Register it in the domain's `agent-tools.ts`, keeping the registry sorted (it's part of the prompt cache key).
6. **Tests** (`apps/api/test/assistant/<tool>.spec.ts`):
   - allowed roles pass; a forbidden role gets `forbidden` and doesn't see the tool;
   - cross-tenant ids/tokens return nothing; a token from another conversation fails;
   - **firewall**: the real output passes the allowlist check, and a mutated output (extra `name` field, free string, unknown nested object) is withheld with `pii_firewall_block`.
7. **Eval cases** in `evals/assistant/cases/<domain>.yaml`:
   - at least one vi and one en question with the expected numeric answer;
   - **one PII-canary case**, where the fixture entities behind this tool carry canary names, phones and notes, and the recorded LLM requests must contain none of them.
8. **Docs**: catalogue row in `docs/domains/ai-agent.md` (name, permission, kind, entity types, owner).
9. Run `pnpm test --filter api -- assistant` and `pnpm eval:assistant` (quality thresholds + PII suite 100%).

## Checklist before PR
- [ ] Needs no personal data or free text (else out of scope)
- [ ] Generated via `agentExposed` where possible; fields classified in the registry
- [ ] Output uses only PII-free types; entities are tokens; no raw ids
- [ ] No tenant ids in input; tokens resolved via vault
- [ ] Permission tested (allowed + forbidden); cross-tenant + cross-conversation token tests
- [ ] Firewall mutation test (withheld) present
- [ ] Write tool returns an ActionProposal (tokens/enums/times), confirmation required
- [ ] Eval cases vi + en + PII canary passing
- [ ] Catalogue row added

## References
- `references/tool-definition-example.md`: annotated example (add when `packages/agent-tools` exists).
- Spec `docs/tasks/08-ai-agent.md`; permissions `docs/tasks/05-auth-tenancy-security.md`; metrics `docs/tasks/07-salon-saas-crm.md`.
