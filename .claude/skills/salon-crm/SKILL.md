---
name: salon-crm
description: Rules and procedures for GuGu's salon workspace (Today, calendar UI, booking ops UI, client CRM, services/team/settings, onboarding, Insights, metric registry). Use before editing apps/app/app/[locale]/(business)/**, apps/app/features/salon-crm/**, apps/api/src/modules/{salon-crm,customers-crm,salon-settings,insights}/** or packages/domain/metrics/**, or when adding a dashboard number, CRM screen, or AI-agent read tool.
---

# Salon CRM

## When to use
- Building or changing any salon-side screen or CRM endpoint.
- Adding or changing a metric, KPI card, or report.
- Exposing salon data to the in-product AI agent.

## Invariants
- MUST get availability and booking mutations from the booking engine API (06). MUST NOT compute slots on the client.
- MUST scope every query by the `salonId` resolved from the member's session. A resource from another salon returns 404 (not 403).
- MUST NOT serialize `CustomerNote` in any customer-facing DTO.
- MUST attach `revenueKind: RevenueKind` (from `packages/domain/metrics/revenue-kind.ts`, owned here) to every money value. MUST NOT use the words payment/paid/verified ("thanh toán", "đã thanh toán") for revenue.
- MUST define every dashboard number in the metric catalogue `packages/domain/metrics/registry.ts`, referencing 04 read models (never raw table queries). 08 generates agent tools from it (X7).
- MUST expose to the agent only read models and metrics with `piiLevel` `none`, `aggregate` or `tokenised`. MUST NOT send names, phones, emails, notes, reviews or message text to any LLM. AI price-list import accepts only price-board content that passes the PII scan (spec G9a).
- MUST take booking sources from the 12-owned enum (X6). MUST call Zalo template messages `zalo_template` (ZBS; "ZNS" only as a legacy alias).
- MUST use i18n keys (vi default, en second). MUST ship empty, loading and error states.
- MUST NOT stack modals: at most one sheet. Destructive actions MUST use a confirm sheet, and reversible ones MUST use an undo snackbar (6 s).

## Operational UX rules (calm UI)
1. **One job per screen, one primary button.** The secondary actions go in an overflow menu.
2. **Today first.** The default landing is the day's timeline, not analytics.
3. **Click budgets:** check-in ≤ 2 taps from launch · walk-in ≤ 3 · quick add for a returning client ≤ 5 / 15 s · reschedule ≤ 4 · cancel 2.
4. **Phone-first lookup.** Search matches the last digits of the phone and is diacritic-insensitive for names ("nguyen" matches "Nguyễn").
5. **Readable at arm's length.** Body ≥ 16 px on mobile, 44 pt targets, status shown with icon + label + colour (never colour alone), AA contrast.
6. **Short, conversational Vietnamese, addressing the user as "anh/chị"** (owner q27; never "bạn" in the CRM). "Khách đã đến", not "Xác nhận check-in khách hàng". Write the vi copy first and en second.
7. **At most 4 headline numbers** per Insights view, each with an "i" definition from the registry and a comparison with the previous period.
8. **Prefill everything:** last service, last staff, next suggested slot, reason chips.
9. **Mobile calendar** is a single-staff day view with a staff switcher plus an agenda. The desktop calendar is a staff-column grid with drag, resize and keyboard (`N`, `T`, `D`, `W`, arrows, `Enter`).
10. **Optimistic UI** only for check-in, complete and no-show. Moves and creates wait for the server, and a 409 shows nearest-slot suggestions.
11. **Offline:** show a "last updated" banner and cached reads. Never queue writes silently.
12. **Calm mode, same brand.** Use the `calm` surface mode tokens: brand type, radii, plum primary, lilac accent only for selection/focus/now-line. No 3D, glass, text gradients, script accents or ambient motion. Never invent CRM-only colours.
13. **Zalo surfaces degrade gracefully.** Hide them, never show broken UI, when Zalo is not connected.

## Product rules from the owner
- The CRM and onboarding are the core product (X13). AI setup from screenshots is in every plan and MUST stay the first onboarding card. The assistant is Pro only.
- Plans (q75): Basic = CRM, calendar, AI import, listing; Pro = + assistant, monthly review, Zalo inbox; Ultra = + chains with combined reporting and admin analytics. Gate with 12 entitlements; show calm upsells for locked features.
- Chains (Ultra only, entitlement `multi_location`): every metric supports `scope: salon | organization`.
- Deleted customers (q71): render "Khách đã xoá / Deleted customer" and never assume a client name or phone exists on a booking. Operational screens stay per location.
- One service per appointment; combos are services or add-on options. No prepaid packages and no staff commission.
- Staff see their own ratings and, by default, client phones (`client.view_contact`, revocable).
- Shared-tablet and personal-device setups both work with no configuration.
- No SMS (X12): invites and messages use links, email or Zalo.

## Revenue kinds (`RevenueKind`)

| kind | Source | vi badge | en badge |
|---|---|---|---|
| `estimated_from_bookings` | Price snapshots of completed bookings | Ước tính | Estimated |
| `recorded_offline_sale` | `OfflineSale` entered at completion | Đã ghi nhận tại salon | Recorded at salon |
| `reported_by_salon` | `SalonReportedRevenue` (daily close) | Salon báo cáo | Reported |

Never sum across kinds into one unlabeled number.

## Procedures

### Add a metric
1. Add an entry to `packages/domain/metrics/registry.ts`: `key`, `labelKey`, `definitionKey`, `readModels` (04 ids), `scopes` (`salon` and, unless impossible, `organization`), `unit`, `revenueKind?`, `grain`, `dimensions`, `permission`, `handler`.
2. Implement the handler in `apps/api/src/modules/insights/handlers/<key>.ts`. Compute in the salon timezone, use one query (no N+1) and index-backed filters.
3. Add vi and en strings for the label and definition (03 conventions).
4. Tests: a handler unit test with fixed fixtures, a cross-tenant isolation test, and an agent-tool parity snapshot (same result through `insights.get_metric`).
5. Update the metric table in `docs/domains/salon-crm.md`.

### Add a CRM screen
1. Add the route under `app/[locale]/(business)/…`. Keep it thin: compose from `features/salon-crm/<area>`.
2. Put the data hook in `features/salon-crm/<area>/hooks`, using `packages/api-client`. The query key includes `salonId`.
3. Build the empty, loading (skeleton) and error states, plus a permission-denied state if the route is role-gated.
4. Check the click budget, run the i18n lint, then write a Playwright test of the main path in both locales.

### Add a CRM endpoint
1. Validate the body and query with a shared Zod schema from `packages/contracts`.
2. Guard it with the tenant guard and a permission from the 05 matrix (`client.view`, `revenue.view`…).
3. Return DTOs from explicit mappers. Never return Prisma entities directly.
4. Add an OpenAPI annotation, regenerate the api-client, and write integration tests (happy path, forbidden role, other-tenant 404).
5. If it is useful to the AI agent and can be aggregate or tokenised, add it to the agent-surface table with its PII level in `docs/tasks/07-salon-crm.md` with R/W and the confirmation flag.

## Pre-PR checklist
- [ ] No availability logic in the client
- [ ] salonId scoping + cross-tenant test
- [ ] Notes not leaked; money has `revenueKind`
- [ ] vi + en keys, no hardcoded strings
- [ ] Empty, loading and error states
- [ ] Click budget respected
- [ ] Domain doc updated

## References
- Spec: `docs/tasks/07-salon-crm.md`
- Domain doc: `docs/domains/salon-crm.md`
- Metric definitions (initial set): see spec §4.6. Copy them into `references/metrics.md` once the registry exists.
