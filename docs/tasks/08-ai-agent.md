# 08 — AI Business Agent ("GuGu Assistant")

Salons on the **Pro** plan get an AI assistant inside the CRM (owner decision q31), including the monthly Opus business review (q63). **AI onboarding import** (screenshots or photos of an existing price list become services) is in **every plan** and is marketed as effortless AI setup (q42). Owners and managers ask in Vietnamese or English ("Tuần này có bao nhiêu lịch hẹn?", "How did March compare to February?", "Which staff member has the most no-shows?") and get accurate answers drawn only from their own salon's data. Later the assistant can propose confirmed actions (block a slot, create a booking for an existing client).

**Hard rule (product owner, 2026-11-02): no personal data is ever sent to the LLM.** That covers customer names, phones, emails, notes, review text, Zalo messages, staff names, and any other free text about a natural person. The assistant works through a **PII firewall** (§4.3): tools return only aggregates and pseudonymous tokens (`staff_3`, `customer_17`, `booking_892`). The model reasons over tokens, and the server swaps tokens back to real names only when it renders the answer to an authorised user, after the model call.

Read with: `docs/ai-first-conventions.md`, `docs/tasks/07-salon-saas-crm.md` (metrics), `04` (read models), `05` (auth/RBAC), `12` (subscriptions).

---

## 1. Scope

### In (for now)
- Agent runtime in `apps/api` (`modules/assistant`): conversation loop, model routing, tool execution, streaming to the client.
- **PII firewall**: input scrubber, tokenizer/token vault, tool-result allowlist check, egress check on every LLM request, server-side re-hydration.
- Tool registry `packages/agent-tools`, generated from the 04 read-model registry and the 07 metric catalogue (X7). Tool I/O Zod schemas live in `packages/contracts/assistant` (X3).
- Per-salon RBAC on every tool call; tenant scope injected server-side.
- Audit of every tool call and write proposal.
- Subscription gating (entitlements from 12): `assistant.enabled` and `assistant.deep` on Pro; `ai_import` on every plan.
- Cost controls: model routing (Haiku → Sonnet → Opus), caching, and a **hard monthly cost cap per salon** (q32, §4.9).
- AI onboarding import pipeline (§4.5), available in every plan and shipped with salon onboarding (roadmap Step 5), ahead of the chat assistant.
- Shared runtime and PII firewall reused by the platform **Admin Copilot** (topic 12, v1, PII-free; q64), see §4.10.
- Conversation storage (tokenized only), retention, deletion.
- vi/en answers, locale-aware numbers, VND, dates in salon timezone.
- Surface: CRM in-app chat panel. MCP server for power users later, tokenized output only.
- Read-only tools first; confirmed write actions later (token-only inputs).

### Features that stay in (PII-free)
| Feature | How it stays PII-free |
|---|---|
| Counts and lists of bookings by period/status/service/staff | Aggregates; entities as tokens |
| Metrics: cancellation, no-show, utilisation, new vs returning customers | Numbers from `MetricCatalog` |
| Revenue by `RevenueKind` | Numbers + enum label |
| Top services, service mix | `service_N` tokens + global category enum + price/duration numbers |
| Staff performance / utilisation | `staff_N` tokens + numbers |
| Top / at-risk customers by visits or recency | `customer_N` tokens + counts/dates, re-hydrated for authorised viewers |
| Day overview ("what does tomorrow look like?") | Time slots, `staff_N`, `service_N`, `booking_N` tokens |
| Period comparisons | Numbers |
| Rating numbers (average, distribution, trend) | Numbers only, never review text |
| AI onboarding import: screenshots/photos of a price list → services (**every plan**) | Image gate with face blurring, OCR redaction and a user preview (§4.5); output is service names/prices, which are business data |
| Phase B confirmed writes: block a slot, create/reschedule a booking for an existing client, send a **templated** reminder | Token + enum + time inputs only; no model-written free text to customers |

### Out of scope for now (requires personal data)
- Review summaries, sentiment, or any reading of review text; drafting replies to reviews.
- Paste-from-Zalo parsing (turning a pasted chat into a booking).
- Zalo chat agent (topic 09 Z3) and the assistant over Zalo OA.
- Anything that reads CRM notes, internal notes, customer tags/labels, booking notes or chat history.
- Personalised free-text messages to customers (only enum-selected templates allowed).
- Creating new customers via the agent (would need a name/phone).
- Images containing people (staff portfolio, review photos, before/after).
- Customer-facing marketplace chatbot.
- Free-form SQL or code execution over data. Autonomous actions. Voice.

---

## 2. Gap analysis

| # | Gap / issue | Decision |
|---|---|---|
| G1 | AI agent missing from the master prompt (no entities, module, subscription link). | New `assistant` module, `agent-tools` package, entities in §4.7 (handed to 04). |
| G2 | "Business results" undefined; the model would invent metric definitions. | Fixed metrics from 07's `MetricCatalog`. Money always carries `RevenueKind = estimated_from_bookings \| recorded_offline_sale \| reported_by_salon` (`packages/domain/metrics`, X5), never summed unlabelled. |
| G3 | Cross-tenant leakage if the model picks `salonId`. | Tenant/actor/role/locale/timezone come from the session into `ToolContext`. No tenant ids in tool inputs. Tokens are per-conversation and can't be resolved outside it. |
| G4 | Role differences (staff must not see salon revenue). | Permission per tool from 05; tool list filtered per role; re-checked at execution; re-hydration also checks permission. |
| G5 | **Personal data reaching the LLM** (PO hard rule). | PII firewall, §4.3: tokens + aggregates only, no free text, allowlist check on tool results, egress check on every request, input scrubbing of the user's own message, re-hydration after the model call. |
| G6 | Prompt injection via customer text. | Removed at the source: no customer/third-party free text ever enters the context. The remaining injection surface is the salon user's own message, and write actions always need UI confirmation. |
| G7 | Unbounded cost at low VND price points. | Routing: Haiku 5.5 by default, Sonnet 5.5 on escalation, Opus 5.5 only for the Pro monthly review (§4.1). Plus caching, compact tool results, and a hard per-salon monthly cost cap enforced before every request (§4.9). |
| G8 | Subscription undefined (12 prepares, doesn't bill). | `EntitlementsService` interface: `assistant.enabled`, quotas. 12 implements it. |
| G9 | Privacy law (X1): PDPL 91/2025/QH15 + Decree 356/2025/ND-CP. | No personal data is sent to the LLM provider, so the provider isn't processing personal data for this feature. Business aggregates are still confidential business data (vendor terms reviewed). Legal review still required; no compliance claim. |
| G10 | Hallucinated numbers. | Answers grounded in tool results; source chips in the UI; numeric-fidelity evals. |
| G11 | Vietnamese relative dates and timezone. | Deterministic `resolve_period` helper in salon TZ (Asia/Ho_Chi_Minh). |
| G12 | Silent regressions. | Eval suite in CI incl. a PII-canary suite (§4.12). |
| G13 | The user's own message can contain PII ("How many bookings did Lan have?", a pasted phone number). | Input scrubber (§4.3 step 1): entity picker chips in the UI, directory match against the salon's staff/customer names, phone/email/ID pattern masking. Owner decision q62: names that aren't in the directory and are typed freely are an accepted risk, mitigated by the mask preview and a composer hint. No strict blocking mode. |

---

## 3. Refined requirements

### 3.1 Functional
- R1. Owner/manager opens the assistant from any CRM screen. Screen context (selected date, selected staff) is passed as structured tokens, not names.
- R2. The composer offers `@` entity pickers (staff, service, client) that insert token chips. The user sees the name; the model sees the token.
- R3. Answers in the UI locale by default; switches if the user writes in the other language.
- R4. Question families: the "stay in" list in §1.
- R5. Every numeric claim traceable to a tool result (source chips). Missing data → say so, don't estimate.
- R6. Names appear in answers only after server re-hydration, and only those the viewer may see (e.g. client names need `customers:read`; otherwise "Khách #17" / "Client #17").
- R7. Suggested follow-up chips (3) after each answer.
- R8. Conversation history per user per salon, stored tokenized. Delete supported. Retention default 90 days (Q4).
- R9. Phase B write actions via `ActionProposal` → confirmation card → normal endpoint with the user's permissions (booking engine revalidates).
- R10. Monthly cost cap reached → chat (and the deep review) stop until the next period, with a localized message; dashboards are unaffected. At 80% of the cap, routing is forced to `fast` and the owner sees a notice.
- R11. Admin (18) can see usage per salon and disable the assistant per salon or globally.

### 3.2 Non-functional
- First token < 2.5 s p50 (Haiku route), full answer < 8 s p90 for single-tool questions.
- Tool handlers p95 < 300 ms (read models, no full scans).
- **Zero personal data in LLM requests**: enforced by the egress check (blocking) and by the canary eval suite (§4.12) in CI.
- Zero cross-tenant results.
- Monthly LLM cost per active salon under the product target (Q3), measured from `usage`.
- Server-originated user-visible strings come from localization (03).

---

## 4. Proposed technical approach

### 4.1 Runtime, provider, model routing
- **Provider: Anthropic API directly** (`@anthropic-ai/sdk`), API key in the secrets manager. A thin `LlmClientFactory` (`LLM_PROVIDER=anthropic`, the default and only implemented adapter) keeps a config switch for later. Other adapters are not built until there's a reason. Data location is not a concern for this feature because no personal data is sent (G9).
- Loop: SDK Tool Runner (`client.beta.messages.toolRunner` + `betaZodTool`) or a thin manual loop; tools run in our API.
- **Default routing** (config-driven, tuned by evals):

| Route | Model | Effort | Used for |
|---|---|---|---|
| `assistant.fast` (**default**) | `claude-haiku-5-5` | `low` | Single metric/count/list, day overview, simple follow-ups: most turns |
| `assistant.standard` | `claude-sonnet-5-5` | `medium` | Escalation: period comparisons, multi-metric questions, ≥3 tool calls, write-action proposals (B), price-list photo structuring |
| `assistant.deep` | `claude-opus-5-5` | `medium` | Only the monthly business review on **Pro** (scheduled job, one per salon per month, PII-free tools only) and offline eval judging. Never in the default chat path |

  - Route selection: a rule-based pre-router (the entry point or suggestion-chip intent, question shape, conversation flags) picks `fast` or `standard`. The Haiku route also has a `request_deeper_analysis` helper tool. Calling it ends the turn, and the server re-runs the turn on `standard`. Escalation is logged. Caches are model-scoped, so a conversation stays on the escalated route once escalated.
  - Prices (Anthropic list, verify at build): Haiku 5.5 $0.10 / $0.50 per MTok (≤100K-token prompts); Sonnet 5.5 $2 / $10, cache reads $0.20; Opus 5.5 $4 / $20, cache reads $0.20.
- All routes: adaptive thinking; explicit `output_config.effort` (Haiku 5.5 and Opus 5.5 default to `medium`, so always set it); explicit, tight `max_tokens`; streaming over SSE with `eager_input_streaming` + server-side Zod validation of tool inputs.
- API constraints for current models: no forced `tool_choice` (use `auto` + `strict: true`), no `temperature`/`top_p`, no prefill, check `stop_reason` (`refusal`, `max_tokens`) before running tools.
- Refusals: Sonnet/Opus routes send server-side `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). Haiku 5.5 has no server-side fallback, so on refusal the server re-runs the turn on `standard`.
- Long conversations: compaction (beta) or a new thread after N turns. The harness is append-only.

### 4.2 Prompt & caching layout
- Order: `tools` (deterministic, sorted, filtered per role) → frozen `system` (persona, rules incl. "entities are tokens; refer to them only by token", metric glossary vi/en) → messages.
- Per-turn volatile context (today in salon TZ, screen tokens, locale) goes in a trailing mid-conversation `system` message.
- Watch `usage.cache_read_input_tokens` in telemetry.

### 4.3 PII firewall
All model-bound data passes through `packages/agent-tools/firewall`. Steps:

1. **Input scrubber (user message → model).**
   - Entity chips from the composer are already tokens.
   - The free text is matched against the salon's directory (staff and customer names, diacritic-insensitive, longest match first). Matches are replaced with the conversation's tokens.
   - Phone numbers (VN formats), emails, national-ID-like and card-like numbers are replaced with `[redacted_phone]` etc.
   - The UI shows the user what was masked ("Gu sees: How many bookings did staff_3 have?").
   - The original text is not stored in assistant tables. Only the scrubbed text and an entity-token list are stored.
2. **Tokenizer / token vault.**
   - Each conversation has a token map `{token → (entityType, entityId)}`. Tokens are sequential per type within that conversation (`staff_1…`), not derived from DB ids, and can't be resolved in another conversation or tenant.
   - The map is stored server-side (`AssistantEntityToken`), holds no names, and is deleted with the conversation.
3. **Tool-result allowlist check (tool → model). Blocking.**
   - Every tool output schema is built only from **PII-free field types** declared in `packages/contracts/assistant/pii-free.ts`: `entityToken` (pattern `^(staff|customer|service|booking|resource)_\d+$`), `metricId`, `revenueKind`, global enums (service category, booking status, weekday), `int`, `decimal`, `money` (VND number), `isoDate`/`isoDateTime`, `duration`, `boolean`, `percent`.
   - **No free `string` type exists in the allowlist.**
   - The firewall validates each actual tool result at runtime against the tool's declared schema *and* the type allowlist. An unknown key, an undeclared string, a value failing its pattern, or a nested object outside the schema means the result is **withheld**. The model receives `{"error":"result_withheld"}`, the event is logged as `pii_firewall_block` with tool name and field path (no values), and an alert fires.
   - A registry build-time check fails CI if any `agentExposed` read model or metric maps a field outside the allowlist.
4. **Egress check (every LLM request). Blocking.**
   - Just before the SDK call, the full request payload (system, messages, tool results) is scanned for phone/email patterns and for exact directory names of the current salon.
   - A hit blocks the request (no call is made). The user gets a localized "couldn't answer safely" message, and the event is logged and alerted. This is defense in depth behind steps 1–3.
5. **Re-hydration (model → user).**
   - The server buffers streamed text at token boundaries (a token may be split across chunks).
   - It replaces tokens from the conversation's map with display names the **viewer** may see (permission check per entity type). Otherwise it renders the localized pseudonym ("Khách #17").
   - Unknown or hallucinated tokens are rendered as-is and logged.
   - Re-hydration happens only on the response to the authenticated CRM user, never on anything sent back to the model.
6. **Storage.** `AssistantMessage` stores the tokenized model transcript only. Names are resolved at read time, so assistant tables hold no personal data except the requesting user's own id.

### 4.4 Tool registry (`packages/agent-tools`)
- Registries are layered (X7):
  1. **04 read-model registry**: query, permission, tenant scope, and per-field PII classification.
  2. **07 metric catalogue**: built on read models.
  3. **08 tools**: generated from read models and metrics flagged `agentExposed`. The generator emits entity references as tokens and drops every field not on the PII-free allowlist; if a required field would be dropped, the build fails.
- Hand-written tools only for helpers (`resolve_period`, `request_deeper_analysis`) and write proposals.
- Interfaces are fixed at A0 (roadmap Step 3); the agent ships in Step 8.
- Tool definition:
```
name            snake_case, domain-prefixed: bookings_count, metrics_get, staff_utilization
description     model-facing, English; vi synonyms; says entities are tokens
input           Zod (packages/contracts/assistant), strict, no tenant ids; entity args are entityToken
output          Zod built only from PII-free field types
permission      e.g. "analytics:read", "bookings:read"
kind            "read" | "write"
confirmation    write tools: "required"
handler         (ctx, input) => output: resolves input tokens via the vault, calls the domain service
entitlement     optional feature key from 12
evalCases       fixture ids incl. a canary case
```
- `ToolContext` = `{ salonId, actorUserId, memberRole, permissions, locale, timezone, conversationId, tokenVault, requestId, surface }`.

### 4.5 AI onboarding import (every plan)
"Upload screenshots or photos of your current price list, and Gu sets up your services." This is the effortless AI setup entry point in the onboarding wizard and in Services (UI owned by 07). Not free chat.
- **Input:** up to N images per import (screenshots from Facebook/Instagram/Zalo pages and booking apps, photos of a printed menu or board), plus optionally pasted price-list text that goes through the same text scrubber.
- **No-PII gate (before any model call):**
  1. Server-side face detection **blurs** faces; screenshots often contain avatars. Reject only if most of the image is a person.
  2. Server-side OCR on our infrastructure finds text regions. We black out phone numbers, emails, URLs/social handles, and person-name patterns: Vietnamese honorific/role + capitalised words (`anh/chị/em/cô/chú/thầy/KTV/stylist + Tên`), plus directory names once staff exist. The directory is usually empty at onboarding, so the pattern rules carry the load.
  3. The user sees the redacted image ("What Gu sees") and can paint over anything else before confirming. Same accepted-risk model as q62.
  4. Only the redacted image is sent. Originals and redacted copies are deleted after extraction; nothing is stored in assistant tables.
- **Model call:** a single structured-output request (no tool loop) on `assistant.standard` (`claude-sonnet-5-5`, vision) returning `{ name, price | priceFrom–priceTo, duration?, category, variant? }[]`. Low-confidence rows are flagged.
- **Review:** the user edits and accepts suggestions before anything is saved (07 services API). Imported service names are business data. In assistant chat they still travel as `service_N`.
- **Cost:** a separate `ai_import` budget, not counted against the Pro chat cap. Per-salon limit on imports per month, set in 12 (q73).
- OCR engine choice and Vietnamese accuracy: spike in milestone IMP.
- Out: importing staff lists, customer lists or contact books (personal data).

### 4.6 Semantic metric layer (with 07)
- `metrics_get(metric, period, groupBy?, filters?)` is generated from `MetricCatalog` (`packages/domain/metrics`, owner 07): `bookings_total`, `bookings_completed`, `cancellation_rate`, `no_show_rate`, `utilization_rate`, `new_customers`, `returning_customers`, `revenue` (split by `RevenueKind`), `avg_rating`, `rating_distribution`, …
- `groupBy` dimensions are tokens or enums only (staff → `staff_N`, service → `service_N`, category, weekday).
- Each metric has a definition (vi/en), unit, source read model, freshness, and `RevenueKind` for money. Every revenue answer names the kind.

### 4.7 Data (handed to 04)
- `AssistantConversation` (id, salonId, userId, surface, locale, route, createdAt, deletedAt). No free-text title; titles are generated from metric/intent labels.
- `AssistantMessage` (id, conversationId, role, tokenized content JSON incl. thinking blocks as returned, model, tokens in/out/cache, stopReason, createdAt)
- `AssistantEntityToken` (conversationId, token, entityType, entityId). Cascades on conversation delete.
- `AssistantToolCall` (id, messageId, salonId, toolName, inputJson (tokens), outputDigest, status, firewallResult, latencyMs, permissionChecked, error). Doubles as audit.
- `AssistantActionProposal` (id, toolCallId, payload (tokens), status, decidedBy, decidedAt, resultRef)
- `AssistantUsage` (salonId, period, route, model, input/output/cache tokens, costMicroUsd, requests, escalations, firewallBlocks)
- Sensitive writes also go to `AuditLog` (05).

### 4.8 Surfaces
- A: CRM panel (desktop side sheet, mobile bottom sheet): streaming, entity chips, "what Gu sees" mask preview, source chips, confirmation cards (B).
- D (later): MCP server with read tools only, OAuth tokens scoped to salon + role. Output stays **tokenized** because the MCP client is an external LLM. No re-hydration over MCP.
- Zalo OA surface: out of scope for now (§1).

### 4.9 Hard monthly cost cap (q32)
- Each salon has a monthly LLM budget from its plan (`assistant.monthlyCap`, set in VND, converted to micro-USD at a fixed rate per period; value TBD, q73). It's enforced **before** every request:
  1. Reserve the worst case: input tokens (estimated) × input price + `max_tokens` × output price for the chosen route.
  2. Refuse if the reservation exceeds the remaining budget.
  3. Settle with the actual `usage` after the call.
- Escalation (fast → standard) and the deep review are only allowed if the remaining budget covers their reservation. The deep review runs only if at least its estimate remains.
- At 80% of the cap, routing is forced to `fast`. At 100%, chat stops for the period.
- A platform-wide daily spend cap (kill switch) protects against bugs and abuse.
- `AssistantUsage` is the ledger (per route and model). 12 owns the plan values and the admin view.

### 4.10 Admin Copilot (topic 12, v1)
- The platform Admin Copilot (owner decision q64) reuses this runtime, routing, firewall and eval harness with its own tool set. The tools are cross-tenant platform aggregates (salon counts, booking volumes, activation and churn metrics) for `super_admin`/`support_admin`, generated from platform read models and metrics.
- The same rule applies: no personal data. Salons appear as `salon_N` tokens and are re-hydrated for admins (salon names of household businesses may be personal names, so they are treated as PII).
- Tool definitions, permissions and UI are owned by 12. 08 provides the shared packages and reviews the tools.

### 4.11 Future: personal data to an LLM (q65)
- The no-PII rule stays the default. It can be lifted **per feature** only after:
  1. a recorded legal review (an ADR referencing PDPL 91/2025/QH15 + Decree 356/2025/ND-CP);
  2. **explicit, revocable consent** from the people concerned, recorded via 05 privacy consent records (salon owner for the business; customers or staff for their own data);
  3. a firewall policy change scoped to that feature, with its own eval suite.
- Until then, features listed as "out of scope" in §1 stay out.

### 4.12 Evals and security tests
- Fixture salon (seeded, deterministic) whose staff/customer names, phones, emails, notes and review texts contain **unique canary strings**.
- Quality suite: 100+ vi/en questions across the stay-in families. Graded on exact numeric match, tool selection and route choice, plus a vi language-quality rubric (Opus judge, offline).
- **PII suite (must be 100%)**:
  - Every LLM request in every eval run is captured by a recording client. CI fails if any canary, phone pattern or email appears.
  - User messages containing staff/customer names and phone numbers are scrubbed to tokens and redactions.
  - A tool deliberately returning an extra `name` field, a free string, or a nested unknown object is withheld (`pii_firewall_block`), and the model never sees it.
  - A registry build with an `agentExposed` read model exposing a non-allowlisted field fails.
  - Egress check blocks a crafted request containing a directory name.
  - Re-hydration: a viewer without `customers:read` sees pseudonyms. Tokens split across stream chunks re-hydrate correctly. Tokens from another conversation don't resolve.
  - MCP responses contain no names.
  - Price-list import rejects an image with a face, and redacts a phone number printed on the list.
- Tenant/permission suite: cross-tenant tokens/ids, staff asking for revenue.
- Runs in CI on prompt/tool/model/routing changes; tracked cost per run.

---

## 5. Acceptance criteria
1. Owner asks "Hôm nay có bao nhiêu lịch hẹn?" and gets the correct count (matches the dashboard) in Vietnamese with a source chip, on the Haiku route.
2. Same in English; locale formatting; VND.
3. "Which staff had the most no-shows last month?": the model sees only `staff_N` tokens, and the owner sees real names after re-hydration.
4. Typing a staff member's name or a phone number in the question: the recorded LLM request contains only a token / `[redacted_phone]`.
5. The PII canary suite passes at 100% in CI. No canary string appears in any recorded LLM request.
6. A tool result with a non-allowlisted field is withheld and logged; the model receives `result_withheld`.
7. Staff role asking for salon revenue gets a polite refusal; the tool is absent from their list and returns 403 if forced.
8. Cross-tenant: context for salon A never yields salon B data; tokens don't resolve across conversations.
9. Routing: ≥ 70% of eval turns are served by the `fast` route with quality thresholds met. Opus is never used in the default chat path.
10. Write proposals require confirmation and execute via the normal endpoint (booking engine revalidation tested).
11. Cost cap: a salon at 100% of its cap gets a localized message and **no model request is sent**. At 80% only the `fast` route is used. Reservations use a conservative input estimate, so settled spend never exceeds the cap.
12. Assistant can be disabled per salon and globally without a redeploy.
13. AI onboarding import works on every plan. Faces in a test screenshot are blurred, a printed phone number and an "anh Tuấn" label are redacted in the image sent to the model (recorded request), and the user's preview matches what was sent.

---

## 6. Dependencies
- 01: monorepo, `packages/agent-tools`, `packages/contracts/assistant` (X3), `LLM_PROVIDER` config, secrets.
- 03: localized strings, pseudonym labels ("Khách #17"), metric glossary vi/en, formatting.
- 04: entities in §4.7; read-model registry with per-field PII classification and `agentExposed` (X7).
- 05: sessions, permission matrix (incl. re-hydration permissions), `ToolContext`, MCP OAuth, AuditLog.
- 06: booking engine APIs for phase B writes.
- 07: `MetricCatalog` + `RevenueKind` in `packages/domain/metrics` (X5, X7); services onboarding entry point for photo import. Hard dependency for phase A.
- 11: templated reminder sending (phase B).
- 12: entitlements (`assistant.enabled` + `assistant.deep` on Pro, `ai_import` on all plans), monthly cost cap values, usage ledger and admin view; Admin Copilot tools (§4.10).
- 13: CI for evals and the PII canary suite, observability/alerts for `pii_firewall_block`.

---

## 7. Suggested sub-milestones
0. **IMP — AI onboarding import (roadmap Step 5, every plan)**: OCR spike (Vietnamese), face blur, redaction rules, preview, structured extraction on Sonnet, `ai_import` budget, recorded-request tests. Ships with 07 onboarding, before the chat assistant.
1. **A0 — Contracts (roadmap Step 3)**: X7 interfaces with 04/07, PII-free field-type allowlist, `ToolDefinition` + generator, `ToolContext`, token vault, entities. ADRs: runtime/routing, PII firewall.
2. **A1 — Firewall + first tools**: input scrubber, allowlist check, egress check, re-hydration; `resolve_period`, `metrics_get` (3 metrics), `bookings_list`. PII + tenant tests.
3. **A2 — Runtime + CRM panel**: streaming, entity chips, mask preview, routing (fast/standard), caching, vi/en, source chips, quota stub.
4. **A3 — Evals in CI**: fixture with canaries, 50 quality questions, the full PII suite.
5. **A4 — Breadth**: remaining metrics, staff/customer token insights, day overview, 100+ evals, usage ledger + cost cap, admin toggle; monthly review job (`assistant.deep`, Pro).
6. **B — Confirmed writes**: block slot, booking create/reschedule for existing clients, templated reminder.
7. **D — MCP server** (tokenized output).

---

## 8. Open questions for the product owner
Answered: q31 (assistant on Pro), q32 (cheaper routing + hard cap), q42 (AI import on every plan), q62 (accept typed names with mask preview), q63 (Opus monthly review on Pro), q64 (Admin Copilot v1), q65 (PII only after legal review + explicit consent).
Open (tracked in the GuGu Roadmap tracker):
- q73 (raised by 12). Starting VND/month values for the hard AI cost cap per plan (Free covers only AI import; Pro covers assistant + monthly review).
- Conversation retention (default 90 days?) and whether staff roles get the assistant (own schedule only?).
- Persona name and tone (e.g. "Gu").
- Phase B priority among the token-only write actions.

## 9. AI-first deliverables
- Subagent `.claude/agents/ai-agent.md`: owns `apps/api/src/modules/assistant/**`, `packages/agent-tools/**`, `packages/contracts/assistant/**`, `apps/app/features/assistant/**`, assistant evals.
- Skill `.claude/skills/agent-tool/SKILL.md`: the procedure every domain follows to expose data to the assistant (PII-free types, tokens, permission, eval + canary case).
- Domain doc `docs/domains/ai-agent.md`: skeleton, filled as code lands.
- ADRs at A0: `docs/adr/NNNN-assistant-runtime-and-routing.md`, `docs/adr/NNNN-assistant-pii-firewall.md`, `docs/adr/NNNN-agent-tool-registry.md`.
- This domain's own model-facing tools: `resolve_period`, `request_deeper_analysis`.
