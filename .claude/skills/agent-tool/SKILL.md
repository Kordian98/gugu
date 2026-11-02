---
name: agent-tool
description: Add or change a tool that the in-product GuGu AI assistant (and MCP server) can call — schema, permission, tenant scoping, PII level, audit, eval case. Use whenever editing apps/api/src/modules/*/agent-tools.ts or packages/agent-tools, or when a domain spec lists a "Product AI-agent surface".
---

# Add a product-agent tool

Every domain exposes selected read models and actions to the salon AI assistant through `packages/agent-tools`. A tool is a thin, permission-checked adapter over an existing domain service. Spec: `docs/tasks/08-ai-agent.md` §4.3.

## When to use
- A domain spec lists an operation under "Product AI-agent surface".
- You add/rename/change inputs or outputs of a domain read model the assistant uses.
- You are reviewing an `agent-tools.ts` diff.

## Invariants
- MUST take tenant/actor only from `ToolContext` (`salonId`, `actorUserId`, `memberRole`, `permissions`, `locale`, `timezone`). MUST NOT put `salonId`/`userId` in the input schema.
- MUST call the domain service, never Prisma directly — the service enforces tenant scoping too (defense in depth).
- MUST declare `permission` from the 05 permission matrix and `kind` (`read` | `write`).
- Write tools MUST set `confirmation: "required"` and return an `ActionProposal`, never perform the change.
- MUST return compact outputs: aggregates or ≤ 50 rows with pagination cursor; ids instead of contact data.
- MUST NOT return phone numbers or emails. Customer names only with `customers:read_pii`.
- Free text written by customers or third parties MUST be wrapped: `{ untrusted_text, source }`.
- Numbers about business performance MUST come from `MetricCatalog` metrics — add a metric (07) rather than computing a new one inside the tool.
- Dates in inputs are ISO ranges; interpret in `ctx.timezone`. Relative periods go through `resolve_period`.
- Input schema: Zod, `.strict()` (→ `additionalProperties: false`), all fields required or explicitly optional; tool is registered with `strict: true`.

## Procedure
1. **Pick the name**: `<domain>_<verb_or_noun>` snake_case, e.g. `bookings_list`, `reviews_summary`. Check `packages/agent-tools/src/registry.ts` for collisions.
2. **Write the description** (English, model-facing): what it returns, when to use it vs similar tools, units, limits. Include Vietnamese synonyms users might say (e.g. "lịch hẹn = booking"). 1–4 sentences.
3. **Define schemas** in `apps/api/src/modules/<domain>/agent-tools.ts`: `input` and `output` Zod schemas; mark untrusted fields with the shared `untrustedText()` helper.
4. **Set metadata**: `permission`, `kind`, `piiLevel` (`none` | `aggregate` | `personal`), optional `entitlement`, `confirmation` for writes.
5. **Implement the handler** `(ctx, input) => output` calling the domain service with `ctx.salonId`. Map domain errors to `ToolError` codes (`not_found`, `forbidden`, `invalid_input`, `unavailable`) — never leak stack traces.
6. **Register** the export in the domain's `agent-tools.ts` list; the registry composes all domains. Keep registry ordering deterministic (sorted by name) — it is part of the prompt cache key.
7. **Tests** (`apps/api/test/assistant/<tool>.spec.ts`):
   - happy path for each role allowed;
   - forbidden role → `forbidden`, and tool absent from that role's tool list;
   - cross-tenant: ids from salon B with context of salon A → no B data;
   - output schema validation; no phone/email keys in output.
8. **Eval case(s)** in `evals/assistant/cases/<domain>.yaml`: at least one vi and one en question that should use the tool, with expected numeric answer from the fixture dataset; add an adversarial case if the output contains untrusted text.
9. **Docs**: add the tool row to the catalogue in `docs/domains/ai-agent.md` (name, permission, kind, piiLevel, owner).
10. Run `pnpm test --filter api -- assistant` and `pnpm eval:assistant`.

## Checklist before PR
- [ ] No tenant ids in input schema
- [ ] Permission declared and tested (allowed + forbidden)
- [ ] Cross-tenant test present
- [ ] Untrusted text wrapped; no phone/email in output
- [ ] Write tool returns ActionProposal with confirmation required
- [ ] Description mentions when NOT to use it
- [ ] Eval cases vi + en added and passing
- [ ] Catalogue row added in `docs/domains/ai-agent.md`

## References
- `references/tool-definition-example.md` — annotated example definition (add when `packages/agent-tools` exists).
- Spec: `docs/tasks/08-ai-agent.md`; permissions: `docs/tasks/05-auth-tenancy-security.md`; metrics: `docs/tasks/07-salon-saas-crm.md`.
