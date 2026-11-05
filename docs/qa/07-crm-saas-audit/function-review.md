# CRM functional audit — 2026-11-05

Scope: source/contract/backend review of customer, team, service, resource, settings and payroll flows, alongside the separate desktop and mobile browser audits. Findings below distinguish code inspection from executed browser/API checks. Existing work was snapshotted as `e935949` before these changes.

## Fixed in this audit

| Finding | Severity | Before | Change and verification |
|---|---|---|---|
| Optional contact details block basic profile edits | P1 | Email-only signup produces no phone/address, but profile save requires both in UI, contract and backend. Renaming the salon silently does nothing. | Name-only PATCH preserves omitted contact/description fields; explicit null clears contact; supplied addresses must be complete. UI explains optional fields and incomplete address. Contract + tenant/role integration regression added. |
| Saving a schedule destroys split shifts / additional breaks | P1 | Editors flatten multiple intervals to first start–last end and retain only first break. Saving an unrelated day can accidentally make lunch hours bookable. | Existing complex intervals/breaks are displayed and round-tripped intact; converting to one shift is explicit. Three unit regressions prove preservation, closing/copying and explicit replacement. Browser regression added. |
| Settings saves erase other unsaved sections | P1 | `key={settings.dataUpdatedAt}` remounts the entire settings form tree on any successful save or refetch. | Key now changes only with salon identity. Editing profile then saving hours retains profile draft; browser regression added. |
| Retry creates duplicate room/equipment types | P1 | Creating type succeeds, creating first resource fails; pressing Save again creates a second type. | Retain the created type ID, lock its name, retry only resource creation, disable pending writes and dismissal. Real API + injected failed second request verified exactly one type POST and two resource POSTs. |
| Accidental removal of staff/resources | P1 | One press immediately deletes a staff profile or resource; no confirmation. | Resource confirmation and replacement staff-confirmation sheet; cancellation preserves entity/draft, confirmation invokes API. All four cancel/confirm browser checks passed against isolated local API. |
| Failed reads look like empty business | P1 | Team/resources show empty state; settings/Insights disappear on errors. | Explicit retry controls, with cached data retained on refetch failure. Error UI in resource deletion remains visible inside confirmation. |
| Small settings theme/language actions | P2 | 42 px targets under project's minimum. | Minimum 44 px targets. |

## Remaining findings / cross-agent handoff

- **Native payroll XLSX export (P1)**: prior `saveBase64File` native branch shared only the filename and discarded bytes. Handed to native export agent; native device verification remains distinct from browser verification.
- **Customer directory (P1)**: first 50 only, no pagination, failures rendered as empty, missing name editor despite API support. Handed to root's customer changes.
- **Customer phone correction/merge (P2)**: update contract has no phone change and no merge endpoint, although older CRM spec promises merging. This needs identity/history handling rather than a superficial text field.
- **Hours/schedule limitations (P2)**: complex shifts are preserved and visible, but the editor still cannot add arbitrary multiple intervals/breaks. The deliberate conversion action supports one interval/one break; a full shift editor remains a separate enhancement.
- **Time off / holiday deletion (P2)**: older editors still delete these entries immediately; no undo/confirmation. Staff/resource deletions were the higher-risk actions fixed here.
- **Staff direct Team URL (P2)**: navigation hides Team without permission, but the disabled query on a manually entered URL can remain in pending state. Backend authorization still enforces access.
- **Insights density (P2)**: up to ten headline metrics exceed the spec's four; hierarchy could be simplified without losing reports.
- **Global search breadth (P2)**: the shell affordance does not cover all originally specified clients/bookings/services use cases. Root is auditing its actual behavior.

## Evidence and limits

- `pnpm --filter @gugu/app exec vitest run features/salon-crm/pages/team/schedule-draft.test.ts`: 3 passed.
- `pnpm --filter @gugu/contracts exec vitest run src/salon-settings/settings.test.ts`: 3 passed.
- `/tmp/gugu-functional-check.ts` against isolated API `:3470` and web `:8470`: resource partial-failure retry, resource cancel/delete, staff cancel/delete all passed (5 checks).
- Reusable `e2e/web/tests/function-audit.spec.ts` covers the above flows in vi/en and adds settings draft, split schedule, and optional profile regression checks.
- Initial integration invocation against the existing test database failed before tests due to a preexisting failed `20261104150000_add_privacy_admin_mfa` migration (P3009). An independent `gugu_crm_function_test` database and Redis DB 11 were prepared for validation; no shared database was reset.
- Fresh isolated profile integration: **1 passed, 9 skipped**, covering 204 name-only preservation and contact clearing, partial-address/invalid-phone 400, staff 403, cross-tenant 404, and contact data retained through a later name edit. API and E2E typechecks passed.
- This review does not claim physical iPhone/Android validation, live-provider delivery, complete load testing, or native export success.
