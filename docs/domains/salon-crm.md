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
- **Customers (M7.7)** — `modules/customers-crm`: profiles materialised from bookings by phone; stats computed at query time; own scope = clients of the member's own appointments (tags too); notes need `customers.notes.write`; phones masked without `customers.phone.read`, and the duplicate-phone 409 then carries no id.
- **Insights (M7.8)** — `modules/insights` over the metric registry (`packages/domain/src/metrics`); money always carries a RevenueKind badge; own scope filters every CTE incl. new/returning history.
- **Internal cost** — `services.cost_amount_minor`, variant `cost_amount_minor`, add-on `extra_cost_amount_minor`. Read and write need `services.cost.read` (owner, manager); others get `cost: null, costVisible: false`, and writes with cost fields are refused (403). `margin.estimated` (registry, `agentExposed: false`, `requiresPermission`) = completed line price (incl. add-ons) − current cost, over services with a cost. `catalog/cost-exposure.test.ts` fails if any module other than catalog/insights reads cost columns (Zalo, AI assistant, public).
- **Rooms & equipment (UI over 06 M6.6)** — `pages/resources/ResourcesScreen` (sidebar "Phòng & thiết bị"): types with resources and capacity (places), inline add/rename/capacity/active/delete, delete-type explains `requiredByServiceCount`; the service editor's "Cần phòng / thiết bị" picker sends `resourceRequirements` (1–3 per type) in the service payload; the booking sheet shows held units ("Phòng 1 · 1"); New appointment links `no_resource` to the screen.
