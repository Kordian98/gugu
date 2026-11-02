# Salon CRM — domain doc

> Durable reference for the salon workspace: Today, calendar UI, booking operations UI, client CRM, salon/services/team settings, onboarding, Insights and the metric registry. Read this before changing salon-side code. Spec and rationale: `docs/tasks/07-salon-crm.md`. Rules: skill `salon-crm`.

**Status:** skeleton. No code yet. Fill in each section as the code lands.

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
_TBD_
| Path | Purpose |
|---|---|
| `apps/app/app/[locale]/(business)/` | Routes |
| `apps/app/features/salon-crm/` | Screens logic, hooks |
| `apps/api/src/modules/insights/` | Metric handlers, read models |
| `packages/domain/metrics/registry.ts` | Metric registry |

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
