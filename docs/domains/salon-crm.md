# Salon CRM — domain doc

> Durable reference for the salon workspace: Today, calendar UI, booking operations UI, client CRM, salon/services/team settings, onboarding, Insights and the metric registry. Read this before changing salon-side code. Spec and rationale: `docs/tasks/07-salon-crm.md`. Rules: skill `salon-crm`.

## Status

- **Built (crm/07-calendar, 2026-11-02):** calendar day view on the booking engine (staff columns with drag-to-reschedule on desktop/tablet, single-staff day + "All" agenda on mobile, tap an empty cell to book), New appointment sheet (client quick pick from the salon's own bookings or inline new client, service/variant/add-ons, staff or anyone, free times from availability, source, note; returning client in 5 taps), appointment sheet (confirm, check-in, complete + optional amount received, no-show, cancel with reason, reschedule picker, status corrections), Appointments page (next 7 days agenda), Today wired to real bookings (timeline, appointments, estimated revenue, upcoming queue, activity), 409 `booking.slot_taken` handled (refresh + message), first-run setup stepper after registration, STUDIO branding, centre "+" on mobile and a reserved bottom-right slot for the AI assistant bubble (topic 08).
- **API added:** `GET salons/:id/clients/lookup`, `GET|PUT salons/:id/bookings/:bookingId/offline-sale` (module `salon-crm`), table `offline_sales`.

- **Built (crm/07-join, 2026-11-02):** workspace shell (sidebar with collapsible sections, icon rail < 1024 px, mobile header + bottom tabs + "More" sheet), page header (search, Ultra-only location label, New appointment, notifications, avatar), Overview/Today (greeting, AI setup checklist, 4 KPI cards, staff timeline, upcoming & live queue, latest activity), section pages with designed empty states, Services (AI setup + manual paths, UI only), Settings (appearance System/Light/Dark, language). Calm light + dark tokens in `@gugu/design-system` (X18).
- **Built (crm/07-catalog, 2026-11-02):** catalogue (services, variants, add-ons q17, active, order, staff assignment), team (staff profiles, roles, weekly schedules + breaks, time off, "add myself", invitations by link/email + join-team screen), salon settings (profile/address, opening hours, holidays/special hours, booking/confirmation q13/q66/q18, cut-offs, policies), onboarding checklist from the API + go-live, session/membership guard on `/[locale]/business/**`, role-aware navigation, salon switcher.
- **Not built:** calendar/appointments data (waits for the booking engine, 06), customers CRM (M7.7), insights (M7.8), AI import (08), photos step (media service), drag-and-drop ordering (arrows for now), per-staff price/duration overrides in the UI (API model exists), date-specific breaks.

## Glossary
| Term (en) | vi | Meaning |
|---|---|---|
| Organization | Chuỗi | Parent of several salons (locations) for combined reporting; the salon stays the tenant |
| AI setup | Thiết lập bằng AI | Onboarding path that builds the service catalogue from price-list screenshots (no PII) |
| Add-on option | Dịch vụ thêm | Optional extra on a service with a price delta and extra duration; used for combos |
| Walk-in | Khách vãng lai | Customer served without a prior booking; booking source `walk_in` |
| Quick add | Thêm nhanh | Receptionist creates a booking from a phone or Zalo request |
| Client profile | Hồ sơ khách | `CustomerSalonProfile`, a per-salon view of a customer |
| Internal note | Ghi chú nội bộ | Team-only note, never shown to the customer |
| Revenue kind | Loại doanh số | `RevenueKind`, the origin label of a money figure (estimated / recorded at salon / reported) |

## Model
Tables (migration `20261102125226_add_catalog_staff_settings`, names agreed with topic 06): `salon_settings` (1:1, incl. `confirmation_mode`, `manual_confirm_window_hours`, `confirm_new_clients`, `hide_staff_choice`, `hold_ttl_minutes`, `availability_version`), `salon_opening_hours`, `salon_holidays`, `staff_profiles`, `staff_schedules` (effective-dated), `staff_breaks` (weekday XOR date), `staff_time_off` (GiST expression index on `tstzrange(starts_at, ends_at)`), `staff_services`, `services`, `service_variants`, `service_addons`, `salon_invitations`. Every tenant table has `@@unique([salonId, id])` and composite FKs `(salon_id, x_id)`. Writes that change availability call `bumpAvailabilityVersion` (salon-settings facade).

_TBD: CustomerSalonProfile, CustomerNote, ClientTag, OfflineSale, SalonReportedRevenue, salon_daily_stats. Link to the schema in `docs/database.md`._

## Invariants
- Availability comes from the booking engine only.
- `salonId` scoping on every query; another tenant's resource returns 404.
- Internal notes never appear in customer DTOs.
- Money values carry `revenueKind` and are never called payments.
- Dashboard numbers come from the metric catalogue only; it is built on 04 read models, and 08 tools are generated from both.
- Booking sources come from the 12-owned enum.
- Multi-location combined reporting is Ultra only; assistant and Zalo inbox are Pro+.
- Deleted customers are anonymised on bookings; their salon notes and tags are deleted.
- No personal data to any LLM: the agent surface is aggregate or tokenised only.
- UI supports light and dark themes (CRM-only, X18) and uses calm surface mode (same brand tokens, no expressive effects).

## File map
| Path | Purpose |
|---|---|
| `apps/app/app/[locale]/(business)/business/_layout.tsx` | `CrmThemeProvider` + `WorkspaceShell` around every workspace route |
| `apps/app/app/[locale]/(business)/business/*.tsx` | Thin routes: index (Today), calendar, appointments, customers, services, team, resources, reviews, insights, settings |
| `apps/app/features/salon-crm/shell/` | `nav.ts` (sections, items, mobile tabs), `Sidebar`, `PageHeader`, `MobileChrome` (header, tabs, More sheet), `WorkspaceShell`, `useBreakpoint`, `useCrmNav` |
| `apps/app/features/salon-crm/theme/CrmThemeProvider.tsx` | System/light/dark preference (web: `prefers-color-scheme` via external store; saved per device until 05 stores it on the account) |
| `apps/app/features/salon-crm/today/` | `TodayScreen`, `SetupCard`, `KpiRow`, `RailCards`, `WeekStrip`, `greeting` |
| `apps/app/features/salon-crm/calendar/Timeline.tsx` | Presentational staff-column timeline (06 decides content) |
| `apps/app/features/salon-crm/pages/` | `SectionScreen` (empty states), `AppointmentsScreen` (`?new=1` prerequisite), `ServicesScreen`, `SettingsScreen` |
| `apps/app/features/salon-crm/data/` | `types.ts` (read models), `useWorkspace` (empty until the API exists), `demo.ts` + `useDemoMode` (dev only: `?demo=1`, `?demo=0` clears; native `EXPO_PUBLIC_CRM_DEMO=1`) |
| `packages/design-system/src/calm.tsx` | `calmColor.light/dark`, `CalmThemeProvider`, `useCalm`, `alpha()` — all derived from Lilac Glow tokens |
| `packages/design-system/src/components/calm/` | `CalmCard`, `CalmButton`, `Pill`, `StatCard`, `Sparkline`, `ProgressBar`, `Avatar` |
| `packages/localization/locales/{vi,en}/crm.json` | `crm` namespace (vi uses "anh/chị") |
| `docs/qa/07-crm-shell/` | Screenshots (Chrome + WebKit, vi/en, light/dark, desktop/tablet/mobile) and side-by-side comparisons with the owner's references |

## Visual language (owner references `design/crm-references/ref-01`, `ref-02`)
- Layout and components follow the references; every colour maps to Lilac Glow tokens (owner decision). Primary buttons and the active nav pill are lilac.500 with plum.950 text (6.2:1), not white text (2.8:1, fails AA).
- Timeline tones: confirmed = lilac, in progress = pink, pending = peach, breaks = hatched tile. Status is always also written as text.
- Navigation shows only GuGu-scope features: Overview, Calendar, Appointments, Customers, Services, Team, Resources · Reviews · Insights & reports · Settings. No Marketing, Promotions, Loyalty, Payments, Transactions, no "soon" items.
- Money is VND with a `RevenueKind` label ("Ước tính / Estimated"); never "payments". No SMS actions (X12).

## Endpoints
All under `/api/v1`, tenant-scoped by the guard (`@RequirePermission`):
- Catalog: `GET/POST salons/:salonId/services`, `PATCH salons/:salonId/services/order`, `PATCH|DELETE salons/:salonId/services/:serviceId`, `PATCH …/:serviceId/active` (`salon.read` / `services.write`).
- Team: `GET/POST salons/:salonId/team`, `PATCH|DELETE …/team/:staffId`, `PATCH …/team/:staffId/schedule`, `POST|DELETE …/team/:staffId/time-off[/:id]`, `POST|DELETE salons/:salonId/invitations[/:id]`, `PATCH salons/:salonId/members/:memberId/role`; public `POST invitations/preview`, authenticated `POST invitations/accept`.
- Settings: `GET salons/:salonId/settings`, `PATCH …/settings/{profile,booking,policies,opening-hours}`, `POST|DELETE …/settings/holidays[/:id]`, `GET …/onboarding`, `POST …/go-live`.

Invitations: single use, 72 h, HMAC-stored token; seat limit (`staff.max_seats`) checked under a per-salon advisory lock at create and accept; emailed invites rate limited (30/salon/day, 20/inviter/hour), salon name sanitised, no tenant text in the subject.

_TBD: generated from OpenAPI, with links._

## Metrics
_TBD: mirror of the registry (key, read models, definition, unit, revenueKind, permission)._

## Flows
_TBD: Today check-in, quick add, walk-in, reschedule, onboarding import._

## AI-agent tools
_TBD: implemented tools, with their permission and confirmation requirements._

## Known limitations
_TBD_

## Bookability, customers, insights, internal cost (2026-11-03)

- **Bookable by default.** A new service without `staffIds` is assigned to every bookable staff member; a new staff member without `serviceIds` gets every active service; updates that omit the list keep links. Editors show prominent checkbox lists (`ui/AssignList`); silent auto-assign only with exactly one bookable member. `onboarding.issues` drives "Not bookable" warnings on Today, Services and Team.
- **Why nothing is free.** `availability.unavailableReason` (pure `unavailableReason()` in `packages/domain/src/booking`) — the CRM and the Zalo bot show it instead of an empty list. `GET /salons/:id/availability/earliest` powers "Find the earliest slot" (31-day chunks, `perDay` cap).
- **Customers (M7.7)** — `modules/customers-crm`: profiles materialised from bookings by phone; stats computed at query time; own scope = clients of the member's own appointments (tags too); notes need `customers.notes.write`; phones masked without `customers.phone.read`, and the duplicate-phone 409 then carries no id. Optional client email on the profile (q87, X26): stored only — GuGu never emails customers — masked like the phone and editable only with `customers.phone.read`; the new-appointment form has no email field.
- **Insights (M7.8)** — `modules/insights` over the metric registry (`packages/domain/src/metrics`); money always carries a RevenueKind badge; own scope filters every CTE incl. new/returning history.
- **Internal cost** — `services.cost_amount_minor`, variant `cost_amount_minor`, add-on `extra_cost_amount_minor`. Read and write need `services.cost.read` (owner, manager); others get `cost: null, costVisible: false`, and writes with cost fields are refused (403). `margin.estimated` (registry, `agentExposed: false`, `requiresPermission`) = completed line price (incl. add-ons) − current cost, over services with a cost. `catalog/cost-exposure.test.ts` fails if any module other than catalog/insights reads cost columns (Zalo, AI assistant, public).
- **Rooms & equipment (UI over 06 M6.6)** — `pages/resources/ResourcesScreen` (sidebar "Phòng & thiết bị"): types with resources and capacity (places), inline add/rename/capacity/active/delete, delete-type explains `requiredByServiceCount`; the service editor's "Cần phòng / thiết bị" picker sends `resourceRequirements` (1–3 per type) in the service payload; the booking sheet shows held units ("Phòng 1 · 1"); New appointment links `no_resource` to the screen.

## E2E-found fixes (2026-11-03)

- **Staff columns without team access.** Staff (`bookings.read.own`, no `members.read`) cannot read `GET /team`, so Today and the calendar build their column with `ownScopeColumns()` (`data/bookings.ts`): the staff profile present in every own-scope booking, labelled with the member's own name. Other people's lines of a shared multi-service booking stay hidden. No bookings means no column (empty state). Used by `useWorkspace` and `pages/calendar/useCalendarData`.
- **Toggle state for screen readers.** Every switch, checkbox and radio spreads `checkableA11y(role, checked)` from `@gugu/design-system`, which emits `role` + `aria-checked`. react-native-web ignores `accessibilityState.checked`.
- **Wizard "Thêm chính tôi".** Success never clears the name field. Adding by name clears it only if it still holds the submitted value.
- **Incomplete availability.** When `availability.truncated` or `earliest.truncated` is set (ADR-0013 amendment), New appointment shows `calendar.truncated` under the slot grid (`crm-availability-truncated`) and in the earliest list (`crm-earliest-truncated`).
- **Calendar times.** Calendar blocks use `formatClock24` (`@gugu/localization`) in both locales, so they match the 24-hour hour column. The rest of the CRM keeps `formatTime` (12 h in en).

## Staff pay, commission, payroll and "This month" profit (2026-11-04, ADR-0016)

Owner request 2026-11-04. Bookkeeping only: GuGu moves no money and computes no personal income tax or social insurance; every screen and the export say "estimates before tax and insurance".

### Rules
- **Commission per completed booking line**, for `booking_services.staff_id` (never the booking's first staff member). No-show / cancelled lines earn nothing; pending / confirmed / checked-in lines are *projected*; pending or confirmed lines whose start passed are *stale* (neither).
- **Base for commission** (salon policy, effective-dated, default `price_after_discount`): line price snapshot; when a lower amount is recorded at the salon it is split pro rata over the booking's lines; `price_minus_cost` subtracts today's service/variant/add-on cost (floored at 0). `OfflineSale` attributes no staff of its own, so it never adds a separate commissionable sale.
- **Rate**: variant override → service override → the person's default %. Fixed overrides pay VND per service performed.
- **Base pay** (version in force per day): monthly × employed days ÷ days in month; per working day × scheduled working days; hourly × scheduled hours (schedules minus breaks and time off). Employment starts at the first pay version and ends on the staff profile's removal day.
- **Payroll line** = base + commission + bonus − deduction − advance (an advance lowers what is left to hand over, not the salon's cost).
- **Close** snapshots the month; it is read-only afterwards (adjustments, pay versions and policy dated inside it → 409 `payroll.month_closed`). **Reopen** needs a reason (audited). **Paid on** marks only on closed months (kept across a reopen). Writes serialise on a per-salon advisory lock.
- **Profit** (`profit.*`): earned (recorded amount where entered, else booked price) + still to come − no-show allowance (salon's own 90-day rate, ≥ 20 finished appointments, labelled assumption; also scales projected costs and commission) − service costs − payroll (full-month base + commission earned + projected + bonus − deduction) − other monthly costs. A closed payroll month feeds the profit view from its snapshot.
- **Permissions**: `payroll.read` / `payroll.manage` owner by default, grantable to managers only (`MANAGER_GRANTABLE_PERMISSIONS`, set by the owner through `PUT members/:memberId/payroll-access`, `members.roles.write`); `payroll.self.read` in every role (own figures only, resolved from the member's own staff profile). Fixed costs and the profit view use the payroll permissions (they contain the team's pay total).
- **AI assistant**: `month_profit` (salon totals and margins, `payroll.read`). Per-person pay never reaches the model (X10). Its payroll total uses the real cost (below), still one salon total.
- **Real cost ("Chi phí thực tế", ADR-0017)**: optional per pay version, a % of gross or a fixed VND/month entered by the salon (from its accountant; GuGu computes no tax or insurance). Fixed is pro-rated by employed days, a % is weighted by the days its version covers and applied to gross (base + commission + bonus − deduction). Payroll rows show gross and real cost side by side; "to pay" stays gross; the profit payroll line uses real cost (`profit.employer_costs`). Never in `payroll/me`.
- **Bulk commission (ADR-0017)**: `POST payroll/commission/bulk` sets one default % or own service rate (or removes it) for several people from a date, also in versions scheduled later; atomic, one audit entry.

### Tables (migration `20261105090000_add_payroll`)
`staff_pay_settings` (unique salon+staff+effective_from; CHECK `staff_pay_settings_valid`; `employer_cost_bps` / `employer_cost_amount_minor` with CHECK `staff_pay_settings_employer_cost_valid`, migration `20261106090000_add_employer_cost`), `staff_commission_overrides` (CHECK `staff_commission_overrides_valid`, unique index `staff_commission_overrides_one_per_target`), `salon_commission_policies`, `payroll_adjustments` (soft delete; CHECK `payroll_adjustments_valid`), `payroll_months` (snapshot JSON; CHECK `payroll_months_first_day`), `payroll_payouts`, `salon_costs` (recurring from start_month to end_month; CHECK `salon_costs_valid`). All tenant tables with composite FKs `(salon_id, x_id)`.

### Endpoints (all `/api/v1/salons/:salonId/…`)
| Method + path | Permission | Notes |
|---|---|---|
| `GET payroll?month=` | `payroll.read` | Rows per person (base, detail, commission, projected, adjustments, total, paidOn), totals, status |
| `GET payroll/me?month=` | `payroll.self.read` | Own estimate only (never the real cost) |
| `GET payroll/me/lines?month=` | `payroll.self.read` | Own commission lines; 404 `payroll.staff_not_found` without a staff profile |
| `GET payroll/staff/:staffId/lines?month=` | `payroll.read` | Commission per line (earned / projected) |
| `GET payroll/export?month=&format=csv\|xlsx&locale=` | `payroll.read` | `{ fileName, mimeType, encoding, content }`; audited |
| `POST payroll/adjustments` · `DELETE payroll/adjustments/:id` | `payroll.manage` | Reason required; audited (no reason text in the log) |
| `POST payroll/months/:month/close` · `…/reopen` | `payroll.manage` | Reopen body `{ reason }`; audited |
| `PUT\|DELETE payroll/months/:month/staff/:staffId/paid` | `payroll.manage` | Closed months only; audited |
| `GET payroll/settings` · `PUT payroll/settings/commission-base` | `payroll.read` / `payroll.manage` | Policy history, current + next scheduled pay per person, managers + grant |
| `POST payroll/commission/bulk` | `payroll.manage` | `{ effectiveFrom, staffIds, change: default % \| own rate per service/variant (null removes) }`; also applied to later versions; audited `payroll.commission_bulk_saved` |
| `GET\|PUT payroll/staff/:staffId/pay` | `payroll.read` / `payroll.manage` | Versions with overrides |
| `PUT members/:memberId/payroll-access` | `members.roles.write` | Managers only (409 `payroll.not_a_manager`) |
| `GET\|POST costs`, `PATCH\|DELETE costs/:costId?month=` | `payroll.read` / `payroll.manage` | Changes apply from the viewed month |
| `GET insights/profit?month=` | `payroll.read` | `metrics` keyed by the `profit.*` registry entries + `breakdown` |

### Metrics (registry `packages/domain/src/metrics/registry.ts`, window `month`)
| key | unit | revenueKind | basis | agentExposed |
|---|---|---|---|---|
| `profit.revenue_earned` | vnd | estimated_from_bookings | actual | yes |
| `profit.revenue_earned_recorded` | vnd | recorded_offline_sale | actual | yes |
| `profit.revenue_upcoming` | vnd | estimated_from_bookings | projected | yes |
| `profit.no_show_allowance` | vnd | estimated_from_bookings | assumption | yes |
| `profit.revenue_total` | vnd | estimated_from_bookings | mixed | yes |
| `profit.service_costs` | vnd | estimated_from_bookings | mixed | yes |
| `profit.payroll` | vnd | estimated_from_bookings | mixed | yes (team total only) |
| `profit.employer_costs` | vnd | estimated_from_bookings | mixed | yes (team total only; included in `profit.payroll`) |
| `profit.other_costs` | vnd | estimated_from_bookings | actual | yes |
| `profit.net` | vnd | estimated_from_bookings | mixed | yes |
| `profit.gross_margin` · `profit.net_margin` · `profit.month_progress` | ratio | — | mixed / actual | yes |

### File map
| Path | Purpose |
|---|---|
| `packages/domain/src/payroll/` | `commission.ts` (rates, versions, discount split, per-line commission), `payroll.ts` (base pay, payroll line), `profit.ts` (month profit, no-show assumption), `month.ts`; unit + property tests |
| `apps/api/src/modules/salon-crm/payroll/` | `payroll-data.ts` (loader, `PayrollClock`), `payroll-engine.ts` (stale rule, month DTO, snapshot), `payroll.service.ts`, `pay-settings.service.ts`, `salon-costs.service.ts`, `payroll-export.ts` (CSV with BOM + formula guard, minimal XLSX) |
| `apps/api/src/modules/salon-crm/http/payroll.controller.ts` | Payroll, settings, costs endpoints |
| `apps/api/src/modules/insights/application/profit.service.ts` | Profit view; registry key → value map (exhaustive) |
| `apps/api/src/modules/assistant/tools/read-tools.ts` | `month_profit` tool; test `assistant/month-profit.int.test.ts` (parity with the profit view, PII allowlist, salary canary) |
| `apps/api/src/modules/salon-crm/payroll.int.test.ts` | Integration suite (chain split, discount, policy, tz boundaries, adjustments, close/reopen/paid, export, permissions, tenant isolation, costs, profit tiles = registry, DB constraints) |
| `apps/app/features/salon-crm/data/payroll.ts` | Hooks (query keys include salonId) |
| `apps/app/features/salon-crm/pages/payroll/` | `PayrollScreen` (tabs: month table/cards + status line; rates), `RatesTab` (everyone's pay, bulk default %, own-rates table service → rate → people, settings), `StaffPayrollSheet` (person breakdown: lines with booking link, adjustments with undo, paid), `PaySheet` (single sheet: base type, amount, default %, own rates, real cost, effective date; also from the Team card), `kit` (big inputs, segmented, effective-date preview, undo bar, status chip), `model.ts` (+ `model.test.ts`: pure view logic), `parts` |
| `apps/app/features/salon-crm/pages/services/ServiceCommission.tsx` | Service editor: commission per person for that service (default vs own), inline change, same % for all; saved with the service via the bulk endpoint |
| `apps/app/features/salon-crm/pages/insights/ProfitView.tsx` | Insights → "Tháng này / This month" (one headline + 3 small tiles, waterfall done vs expected, fixed costs) |
| `apps/app/features/salon-crm/today/MonthCards.tsx` | Today: owner profit card (+ link to payroll), staff own earnings: one big number + top services (also in MyDay) |
| `apps/api/src/modules/salon-crm/payroll/commission-change.ts` | Pure bulk change applied to a version (+ unit test) |
| `apps/api/src/modules/salon-crm/payroll-ux.int.test.ts` | Bulk endpoint, next version, own lines, real-cost math/effective dates/profit/snapshot/staff never sees it |
| `apps/api/scripts/seed-payroll-demo.mjs` | Dev-only demo month (history, chains, pay types, costs, closed month, staff + manager logins) |
| `scripts/e2e/crm-payroll.mjs` | Playwright flow check; screenshots `docs/qa/07-payroll/` |
| `scripts/e2e/crm-payroll-ux.mjs` | Before/after screenshots of the payroll UX (1440 + 390, vi, + dark) → `docs/qa/07-payroll-ux/` |
| `e2e/web/tests/payroll.spec.ts` | Team pay card → sheet (validation, grouped amount, real cost), month table totals, breakdown + adjustment undo, bulk %, service commission, phone cards, close/reopen, This-month headline = registry, staff own lines only |

### Fixed L2 (security review of multi-service)
Own-scope and per-staff Insights are line-based: a booking is the member's when any line is theirs; revenue per staff and own-scope revenue use their lines' `price_minor`; a recorded amount in own scope is the member's price share. `customers.service.ts` (list, tags, detail), `client-lookup.query.ts` and `offline-sale.service.ts` use the same "any line" read scope as the booking engine.

### Known limitations
- Service costs use today's cost (no cost snapshot on booking lines).
- Per-day / hourly pay follow schedules; no clock-in.
- Native XLSX download shares only the file name (no file-system module yet); CSV/XLSX download works on web.
- Social insurance / PIT not computed (q98).
