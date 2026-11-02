# Salon CRM — domain doc

> Durable reference for the salon workspace: Today, calendar UI, booking operations UI, client CRM, salon/services/team settings, onboarding, Insights and the metric registry. Read this before changing salon-side code. Spec and rationale: `docs/tasks/07-salon-crm.md`. Rules: skill `salon-crm`.

## Status

- **Built (crm/07-join, 2026-11-02):** workspace shell (sidebar with collapsible sections, icon rail < 1024 px, mobile header + bottom tabs + "More" sheet), page header (search, Ultra-only location label, New appointment, notifications, avatar), Overview/Today (greeting, AI setup checklist, 4 KPI cards, staff timeline, upcoming & live queue, latest activity), section pages with designed empty states, Services (AI setup + manual paths, UI only), Settings (appearance System/Light/Dark, language). Calm light + dark tokens in `@gugu/design-system` (X18).
- **Not built:** no data is fetched yet (no salon/calendar/insights API); every number is an empty state unless the dev-only demo seed is on. No auth guard or role filtering (topic 05 session). AI import (08), booking actions (06), registration form (`/business/join`, waits for topic 05's contract on main), search results, notifications feed, salon switcher menu.

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
_TBD: generated from OpenAPI, with links._

## Metrics
_TBD: mirror of the registry (key, read models, definition, unit, revenueKind, permission)._

## Flows
_TBD: Today check-in, quick add, walk-in, reschedule, onboarding import._

## AI-agent tools
_TBD: implemented tools, with their permission and confirmation requirements._

## Known limitations
_TBD_
