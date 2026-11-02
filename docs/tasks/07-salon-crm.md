# 07 — Salon SaaS / CRM (UX-first)

> The salon side of GuGu: the "today" view, calendar, booking operations, customer CRM, service/staff/profile management, onboarding and dashboards. It has to be extremely simple to read and operate, built around how Vietnamese salons actually work (Zalo, phone calls, walk-ins), and expose clean read models that both dashboards and the AI business agent (08) use.
>
> Source: master prompt §13 (plus touchpoints in §11, §14, §17) and the product owner's requirements (intuitive CRM, AI-agent-ready, Zalo-native).
> Owner subagent: `.claude/agents/salon-crm.md` · Skill: `.claude/skills/salon-crm/SKILL.md` · Domain doc: `docs/domains/salon-crm.md`

---

## 1. Scope

### In
- Salon workspace shell: navigation, the role-aware "Today" home, global search, quick actions.
- Calendar: day, week, staff (resource) and list views; create, move, resize, cancel, check in, complete, no-show; walk-ins.
- Booking operations UI on top of the booking engine (06). The UI never computes availability.
- Customer CRM: directory, profile, visit history, notes (internal only), tags, no-show history, preferred services and staff, last visit, contact channels (phone, Zalo).
- Management screens: salon profile, opening hours and holidays, services and variants, staff with schedules, breaks, time off and permissions, booking and cancellation policy.
- Onboarding wizard, including AI-assisted import of a price list from a photo, PDF or pasted Zalo/Facebook message.
- Dashboard and reports: appointments, customers (new vs returning), no-show rate, utilization, popular services, staff utilization, revenue with explicit provenance labels.
- Read-model / metrics API (`/api/v1/salons/:salonId/insights/*`), shared by dashboards and the AI agent.
- Offline sale recording (manual "paid at salon" amount at completion). This is not payment processing.

### Out (owned elsewhere)
- Slot algorithm, holds, concurrency, state machine → **06**.
- Roles, permission enforcement, RLS → **05**. This topic defines the CRM permission *needs*; 05 owns the matrix.
- Zalo OA connection, inbox transport, ZNS templates → **09**. This topic defines where Zalo shows up in the CRM UX.
- AI agent runtime, LLM, conversation storage → **08**. This topic defines the read models and tool candidates.
- Notification delivery → **11**. Attribution and commission ledger, subscriptions → **12**.
- Visual tokens and components → **02**. This topic sets the operational UX rules that apply on top of them.

---

## 2. Gap analysis

| # | Gap / issue in master prompt | Decision |
|---|---|---|
| G1 | No mention of **walk-ins**, which are a large share of traffic in VN nail and hair shops. | Walk-in is a first-class flow: one tap creates an "in-progress now" booking with source `walk_in`, gets the next free staff, and skips customer identification (an anonymous customer can be linked later). Add `walk_in` to the acquisition sources (coordinate with 12). |
| G2 | No mention of **phone and Zalo bookings** entered by the receptionist. That is the dominant channel today: salons use notebooks, Zalo and Excel. | "Quick add" booking, under 15 s for a returning customer: phone-number-first search, recent customers, last service prefilled. Source `phone` / `zalo_chat` / `staff_created`. |
| G3 | "Customer CRM" has no dedupe or identity rules. Phone is the de-facto ID in VN, and customers change numbers or share family phones. | `CustomerSalonProfile` is keyed on salon + normalized E.164 phone (nullable for anonymous walk-ins). There is a merge-profiles action (owner/manager), audited. A GuGu account links to the profile when the phone is verified. |
| G4 | The dashboard KPI list is long. The prompt asks for it to be "simple to read", but a dense KPI dashboard is the opposite of that. | The home is **Today**, not analytics: a timeline of the day plus at most 3 status chips. Analytics lives in a separate "Insights" tab with at most 4 headline numbers, each expandable. Every metric has one canonical definition (§4.6). |
| G5 | Revenue labelling is mentioned but not modelled. | Each money figure carries a `provenance` enum: `estimated_from_bookings`, `reported_by_salon`, `recorded_offline_sale`. The UI shows a mandatory badge and tooltip. The figures never sum across provenance without a label. The words "payment" and "doanh thu đã thanh toán" are never used. |
| G6 | No **multi-location** model. A chain with two branches is common. | MVP: 1 Salon = 1 location = 1 tenant. An owner may own several salons and switch between them (workspace switcher). An org-level rollup is deferred, but the data model (05/04) must allow an `Organization` parent later. |
| G7 | Staff "performance" is undefined and could feel punitive. | Show utilization, completed appointments, rebooking rate and average rating. Staff see only their own numbers, and owner/manager see everyone's. Owners can hide ratings from staff. |
| G8 | No offline or flaky-network behaviour for the calendar, although receptionists run it on cheap Android phones and tablets. | Read caching (TanStack Query persisted) with a visible "offline / last updated" banner. Writes require a connection in MVP: show a clear retry and never queue silently. Offline write queue is out of scope for MVP. |
| G9 | No AI-agent readiness, although that is a product requirement. | All dashboard numbers come from documented read-model endpoints with Zod schemas, which are also registered as agent tools (§8). Dashboards hold no business logic of their own. |
| G10 | "Promote their business" in the vision has no screen. | Placeholder "Grow" tab with a shareable booking link and QR code (attribution source `qr_code` / `direct_link`). Promoted listings come later (12). |
| G11 | No undo, confirmation or error policy for destructive calendar actions. | Reversible actions (move, check-in) give an inline **Undo** snackbar for 6 s. Irreversible or customer-notifying actions (cancel, no-show) get a one-step confirm sheet with the reason prefilled. |
| G12 | Customer notification on salon-side changes is unspecified. | Any salon-side reschedule or cancel shows a "Customer will be notified via {channel}" line with a toggle (default on). The event is emitted to 11. |
| G13 | Mobile calendar for 5+ staff is unusable if shown as columns. | Mobile defaults to the single-staff day view with a staff chip switcher plus an "All" agenda list. Desktop shows multi-column staff view (see §4.3). |

---

## 3. Refined requirements

### 3.1 Information architecture

Primary navigation is role-aware. It is a bottom tab bar on mobile and a left rail on tablet and desktop.

| Tab (vi / en) | Content | Roles |
|---|---|---|
| **Hôm nay / Today** | Day timeline, next-up card, walk-in button, alerts | all |
| **Lịch / Calendar** | Day / week / staff / list | owner, manager, receptionist; staff see only their own |
| **Khách hàng / Clients** | Directory, profiles | owner, manager, receptionist; staff get a limited view |
| **Tin nhắn / Inbox** | Zalo OA + in-app messages (09). Hidden if not connected | owner, manager, receptionist |
| **Thêm / More** | Insights, Services, Team, Salon profile, Grow, Settings, AI assistant entry | by permission |

- Global **"+" quick action** (FAB on mobile, `N` key on desktop): New booking · Walk-in · Block time · New client.
- Global **search** (`/` or `Cmd+K`): clients by phone or name (diacritic-insensitive), bookings by code, services.
- **AI assistant** (08) is a persistent button that opens a side panel on desktop and a bottom sheet on mobile, gated by subscription.

### 3.2 "Today" home (default screen)
1. Header: date, salon open/closed state, and the staff on shift as an avatar row.
2. Three chips at most: `Còn lại hôm nay / Remaining today` count, `Chờ xác nhận / Pending` (tappable), `Đến muộn / Late` (booking start passed without check-in).
3. **Next up** card: customer, service, staff, time, one-tap **Check in** and a **Call / Zalo** action.
4. Timeline list of today's bookings grouped by time, with status pills and swipe actions on mobile (check in, complete, no-show).
5. Big **Walk-in** button.
6. Staff role sees only their own day.

Acceptance: a receptionist can find the next customer and check them in with **at most 2 taps** from app open.

### 3.3 Calendar
- **Desktop (≥1024 px):** staff columns × time rows. Grid granularity is the salon slot interval (default 15 min). Drag to move, drag the edge to resize (only extends duration; the server revalidates), click an empty cell to create (prefills staff and time). A now-line, colour by status, and a service colour stripe. Keyboard: arrows move focus, `Enter` opens, `N` creates, `T` jumps to today, `D`/`W` switch views.
- **Tablet (768–1023 px):** same grid, up to 4 staff columns visible, horizontally scrollable.
- **Mobile (<768 px):** single-staff day view with a staff chip switcher plus an "All" agenda. Week view is a compact 7-day strip with counts per day. Long press opens the move flow, and there is no free drag.
- Every mutation goes to the 06 API. Optimistic UI is allowed **only** for check-in, complete and no-show; moves wait for server confirmation and show a skeleton ghost.
- Conflicts returned by the server (409) show a human message and suggest the nearest valid slots (from 06).
- Blocked time (lunch, personal) creates a staff break or time-off through 06/04 entities.
- The calendar is platform-specific where needed (`Calendar.web.tsx` uses a virtualized grid, native uses a FlashList-based agenda). Both use the same hooks in `features/calendar`.

### 3.4 Receptionist flows (click budgets)

| Flow | Budget | Notes |
|---|---|---|
| Quick add for a returning client from a phone call | ≤ 15 s, ≤ 5 taps | Type the last 3–4 phone digits → pick the client → last service and staff prefilled → pick a suggested slot → confirm. |
| Quick add for a new client | ≤ 30 s | Phone + name only; the rest is optional. |
| Walk-in | ≤ 3 taps | Service (or "decide later") → staff (default: first free) → start now. |
| Check in / complete / no-show | 1 tap + undo | Complete can open an optional "amount received" field (offline sale). |
| Reschedule | ≤ 4 taps | Pick the booking, choose from suggested slots or drag on desktop, notify toggle. |
| Cancel | 2 taps | Reason chips plus a free-text note. |
| Paste from Zalo | ≤ 3 taps | Paste a customer message ("mai 3h chiều làm gel nhé") → the AI parser (08) suggests client, service and time → the receptionist confirms. This is behind a feature flag and needs a subscription. Without it, the paste fills the notes field. |

### 3.5 Customer CRM
- Directory: search, filters (tag, last visit range, no-show ≥ N, new/returning, birthday this month), sort by last visit or visits. Virtualized list on mobile, table on desktop.
- Profile: header (name, phone, Zalo link state, tags), stats (visits, last visit, no-shows, estimated lifetime value labelled `estimated_from_bookings`), upcoming bookings, history, preferred services and staff (derived), **internal notes** (labelled "Only your team sees this"; never returned by customer-facing APIs; separate table and permission), and consent flags (marketing via Zalo/SMS).
- Actions: book again (prefilled), call, open Zalo chat (09), add note, tag, merge, export (owner only, audited).
- Tags are salon-defined plus system tags (`VIP`, `new`, `at_risk` = no visit in 2× their average interval). System tags are computed, not editable.

### 3.6 Management
- **Services:** a list grouped by category with drag reorder. The editor covers name (vi + en, vi required), category, duration, buffer, price or price range, variants (each with its own price and duration), assigned staff, per-staff price override, active toggle, and booking restrictions (min notice, max advance, online-bookable toggle). Changes never touch existing bookings, because bookings keep snapshots (04/06).
- **Team:** invite by phone (SMS/Zalo link) or email. Profile, role (owner/manager/receptionist/staff), weekly schedule grid with breaks, time off, assigned services and an individual calendar link. The permission UI shows plain-language toggles mapped onto the 05 matrix.
- **Salon profile:** everything listed in §13 of the master prompt, plus a live preview of the public page (10).
- **Hours and holidays:** a weekly template plus exceptions and a VN public holiday suggestion list (Tết etc.) that is opt-in per year and stored in the DB.
- **Policies:** booking policy, cancellation window (hours), and a no-show policy text shown to customers.

### 3.7 Onboarding wizard (target: first bookable state in under 10 minutes)
1. Business basics: name, category, phone, address with a map pin.
2. Hours: template presets ("9:00–21:00 every day" is common).
3. Services: **Import** (photo or PDF of the price board, or pasted text from Zalo/Facebook → AI extraction (08) → editable table with confidence highlighting) **or** pick from category templates **or** add manually.
4. Team: "Just me" or add staff (name plus services).
5. Photos: logo, cover, gallery (optional, can skip).
6. Go live: show the share link and QR code, plus an optional Zalo OA connect step (09).

Progress is saved after each step. A checklist card on Today shows the remaining setup until it is complete. AI import is never auto-published; a human always confirms.

### 3.8 Insights (analytics)
- Four headline cards: appointments, new vs returning customers, no-show rate, estimated revenue (badge). Period picker: today / 7 d / 30 d / custom. Each card shows a comparison with the previous period.
- Drill-downs: popular services, staff utilization, cancellation reasons, booking sources (attribution, no commission data shown here unless 12 enables it).
- Every number links to its metric definition (an "i" icon) that uses the same text as the metric registry (§4.6).
- Staff see only personal insights.

### 3.9 Empty, loading and error states
Every list and panel ships all three states, with a localized copy key per screen.
- Empty states are actionable: "No services yet → Import price list / Add service", or "No bookings today → Share your booking link".
- Skeletons match the final layout, with no spinners on full screens.
- Errors are human, localized and give a retry. Server error codes map to i18n keys (03).

### 3.10 Revenue provenance (hard rule)
- `estimated_from_bookings`: the sum of booking price snapshots for completed bookings (ranges use the min price, flagged).
- `reported_by_salon`: periodic totals the salon enters manually (optional "daily close" form).
- `recorded_offline_sale`: an amount entered at completion for a specific booking.
- The UI badge text is "Ước tính / Estimated", "Salon báo cáo / Reported" or "Đã ghi nhận tại salon / Recorded at salon". None of these may be labelled payment, paid, or verified.

### 3.11 Accessibility and readability
- Minimum body text 16 px on mobile, a 44 pt touch target, WCAG AA contrast, and status never shown by colour alone (icon plus label).
- Vietnamese copy is short and conversational ("Khách đã đến" rather than "Xác nhận check-in khách hàng").
- One primary action per screen, no modal stacking (at most one sheet), and destructive actions sit apart from primary ones.

---

## 4. Proposed technical approach

### 4.1 Frontend structure (`apps/app`)
```
app/[locale]/(business)/
  _layout.tsx                 # workspace shell, salon switcher, role-aware nav
  index.tsx                   # Today
  calendar/index.tsx
  calendar/[bookingId].tsx
  clients/index.tsx
  clients/[clientId].tsx
  inbox/...                   # mounted only if Zalo feature enabled (09)
  insights/index.tsx
  services/... team/... settings/... onboarding/...
features/salon-crm/
  today/ calendar/ clients/ services/ team/ onboarding/ insights/
  hooks/ (useTodayBookings, useCalendarRange, useClient, useInsight...)
```
- Screens are thin. Logic lives in `features/*/hooks`, and API calls go through `packages/api-client` (generated from OpenAPI).
- Platform splits only for the calendar grid and data tables (`*.web.tsx`).
- Client state lives in Zustand (selected staff, calendar view, current salon) and server state in TanStack Query with query keys that include the `salonId`.

### 4.2 Backend modules (`apps/api/src/modules`)
- `salon-crm` (or split into `customers-crm`, `salon-settings`, `insights`). The CRM never writes bookings directly; it calls the `bookings` module service.
- The `insights` module owns read models. Start with SQL views or queries over OLTP with indexes, and add `salon_daily_stats` materialized rollups refreshed by BullMQ (hourly, plus on booking status change for the current day) once data volume requires it.

### 4.3 Calendar data contract
`GET /api/v1/salons/:salonId/calendar?from&to&staffIds[]` returns bookings, breaks, time off and closed ranges in one payload (no N+1). Times are UTC ISO plus the salon timezone, and the client renders in salon tz.

### 4.4 Customer identity
`CustomerSalonProfile(salonId, phoneE164 nullable, customerUserId nullable, displayName, tags[], marketingConsent{zalo,sms,email}, mergedIntoId)`. Unique on (salonId, phoneE164) where phoneE164 is not null. Notes live in `CustomerNote(salonId, profileId, authorMemberId, body, createdAt)` and are never joined into customer-facing DTOs (tested).

### 4.5 Offline sale and reported revenue
- `OfflineSale(salonId, bookingId unique, amountVnd, recordedByMemberId, recordedAt, method enum{cash, bank_transfer, momo, other}, note)`. Method is informational only.
- `SalonReportedRevenue(salonId, periodStart, periodEnd, amountVnd, reportedBy)`.
- Hand both entities to 04 for the schema.

### 4.6 Metric registry (single source of truth)
`packages/domain/metrics/registry.ts` holds a typed list of metric definitions:
`{ key, labelKey (i18n), definitionKey (i18n), unit, provenance?, grain, dimensions[], permission, query handler name }`.
Used by:
1. API: `GET /insights/metrics/:key?from&to&groupBy` validated against the registry.
2. Dashboards: render cards from the registry.
3. AI agent (08): tool descriptions are generated from the registry, so there is one definition for both humans and the LLM.

Initial metrics:

| key | Definition |
|---|---|
| `appointments.count` | Bookings with start in the period, by status. Excludes cancelled unless grouped by status. |
| `appointments.completed` | Status `completed` in the period. |
| `customers.new` | Profiles whose first completed booking at this salon is in the period. |
| `customers.returning` | Customers with a completed booking in the period and an earlier completed one. |
| `no_show.rate` | no_show / (completed + no_show + checked_in) in the period. |
| `cancellation.rate` | cancelled_* / all created for that period's start dates. |
| `utilization.salon` | Booked staff-minutes / available staff-minutes (schedules minus breaks and time off). |
| `utilization.staff` | Same, per staff. |
| `services.popular` | Completed BookingService count by service and variant. |
| `revenue.estimated` | Sum of price snapshots, completed bookings. Provenance `estimated_from_bookings`. |
| `revenue.offline_recorded` | Sum of OfflineSale. Provenance `recorded_offline_sale`. |
| `revenue.reported` | Sum of SalonReportedRevenue. Provenance `reported_by_salon`. |
| `bookings.by_source` | Count by attribution source (from 12). |
| `rebooking.rate` | Customers completing again within N days (default 60). |

All metrics are computed in the salon timezone with day boundaries in `Asia/Ho_Chi_Minh` by default.

### 4.7 Zalo touchpoints (contracts for 09)
- Client profile: `zaloLinkState` (not_linked / follower / linked) and an "Open chat" deeplink or in-app inbox thread.
- Booking detail: a "Send confirmation via Zalo" status from the notification log (11/09).
- Inbox: a thread list keyed to `CustomerSalonProfile`, with a "Create booking from this chat" action that prefills from the message (AI parse, 08).
- All of these degrade gracefully when Zalo is not connected.

### 4.8 Permissions needed (input for 05)
`calendar.view_all`, `calendar.view_own`, `booking.create`, `booking.update`, `booking.cancel`, `booking.mark_no_show`, `client.view`, `client.view_contact`, `client.notes.read`, `client.notes.write`, `client.merge`, `client.export`, `service.manage`, `team.manage`, `team.schedule.manage`, `salon.profile.manage`, `insights.view_all`, `insights.view_own`, `revenue.view`, `offline_sale.record`, `inbox.use`, `ai_assistant.use`.

---

## 5. Acceptance criteria

1. **Today:** a receptionist can check in the next customer in at most 2 taps from launch (Playwright plus manual check on a 360×800 Android).
2. **Quick add:** creating a booking for an existing client takes at most 5 interactions (scripted E2E counts them).
3. **Walk-in:** creates a booking at "now" with source `walk_in` in at most 3 taps. The server validates staff availability, and with no free staff it offers the nearest time.
4. **Calendar desktop:** drag-move calls the 06 reschedule endpoint, a server conflict reverts the UI with a localized message and suggestions, and keyboard navigation works for create, open and switch view.
5. **Calendar mobile:** the staff switcher and agenda render 200 bookings/day at 60 fps target on a mid-range Android (FlashList).
6. **Tenant isolation:** every CRM endpoint returns 404 for a resource of another salon (integration test per endpoint, shared with 05).
7. **Internal notes:** none of the customer-facing endpoints serialize `CustomerNote` (contract test scanning DTOs plus an E2E).
8. **Revenue labels:** every money value in the UI has a provenance badge, and a lint/test fails if a money component renders without `provenance`.
9. **Metric registry:** every dashboard number comes from a registry key, and the same key is callable through the agent tool layer with identical results (snapshot test).
10. **Onboarding:** a fresh salon reaches "bookable" (at least 1 service, hours, 1 staff) in a timed usability test under 10 minutes. AI import produces an editable draft and never publishes without confirmation.
11. **States:** every screen has empty, loading and error states (checklist plus Storybook/visual stories).
12. **i18n:** zero hardcoded strings in `features/salon-crm` (lint rule from 03), and both locales verified on Today, Calendar, Client profile and Insights.
13. **Permissions:** staff role sees only their own calendar and insights, and the receptionist cannot see revenue unless granted (integration tests).

---

## 6. Dependencies

| Topic | Need |
|---|---|
| 01 | Monorepo, app routing groups, api-client generation |
| 02 | Tokens and components; the operational density variant ("calm" UI mode) |
| 03 | i18n keys, VND and date formatting, error-code mapping |
| 04 | Schema: CustomerSalonProfile, CustomerNote, tags, OfflineSale, SalonReportedRevenue, salon_daily_stats |
| 05 | Permission matrix (§4.8), tenant guard, audit log for merge, export and notes |
| 06 | Calendar feed, create/reschedule/cancel/status endpoints, conflict suggestions, walk-in "start now" |
| 08 | AI import of price lists, chat-to-booking parse, assistant panel, tools from the metric registry |
| 09 | Inbox, Zalo link state, OA connect step in onboarding |
| 10 | Public profile preview, share link |
| 11 | Customer notification on salon-side changes, notification log status |
| 12 | Acquisition sources (`walk_in`, `phone`, `zalo_chat` added), subscription gating for the AI and Inbox features, feature flags |
| 13 | Playwright E2E, device test matrix |

---

## 7. Suggested sub-milestones

1. **M7.1 Shell and Today (read-only):** workspace layout, role-aware nav, salon switcher, Today timeline from the 06 feed, empty, loading and error states.
2. **M7.2 Booking ops:** quick add, walk-in, check-in, complete, no-show, cancel with undo/confirm policy; booking detail sheet.
3. **M7.3 Calendar:** desktop staff grid with drag/resize and keyboard; mobile staff day view and agenda; block time.
4. **M7.4 Services and team management:** services and variants editor, team invite, schedules, time off, permissions UI.
5. **M7.5 Salon profile, hours, holidays and policies,** with a public preview.
6. **M7.6 Onboarding wizard** (manual and template paths), with the setup checklist on Today.
7. **M7.7 CRM:** directory, profile, notes, tags, merge, consent flags.
8. **M7.8 Metric registry and Insights,** plus OfflineSale and the reported revenue form.
9. **M7.9 AI hooks:** price-list import, paste-from-Zalo parse, assistant panel entry (with 08).
10. **M7.10 Zalo surfaces:** inbox, link state, chat-to-booking (with 09).

M7.1–M7.5 map to Phase 2 of the master plan. M7.7–M7.8 belong late in Phase 2 or Phase 3. M7.9–M7.10 come after 08 and 09 foundations.

---

## 8. Product AI-agent surface

These tools are generated from the metric registry plus explicit CRM tools. Every tool is tenant-scoped by the server from the session (never from model input) and permission-checked as the asking member.

| Tool | R/W | Input | Permission | Confirmation |
|---|---|---|---|---|
| `insights.get_metric` | R | `{ key, from, to, groupBy? }` | per metric (`insights.view_all` / `revenue.view`) | — |
| `insights.list_metrics` | R | `{}` | any member | — |
| `calendar.get_day` | R | `{ date, staffId? }` | `calendar.view_all` / `view_own` | — |
| `bookings.search` | R | `{ from?, to?, status?, clientPhone?, staffId? }` | `calendar.view_all` | — |
| `clients.search` | R | `{ query, tag? }` | `client.view` | — |
| `clients.get_profile` | R | `{ clientId }` (notes excluded unless `client.notes.read`) | `client.view` | — |
| `clients.at_risk` | R | `{ limit }` | `client.view` | — |
| `availability.suggest_slots` | R | `{ serviceId, variantId?, staffId?, date }` → 06 | `booking.create` | — |
| `bookings.create_draft` | W | `{ clientId or phone+name, items[], startAt, staffId? }` | `booking.create` | **required** (human taps confirm) |
| `bookings.reschedule_draft` | W | `{ bookingId, newStartAt }` | `booking.update` | **required** |
| `services.import_draft` | W | `{ sourceMediaId or text }` → draft table | `service.manage` | **required** |
| `clients.add_note` | W | `{ clientId, body }` | `client.notes.write` | **required** |

Rules: the agent never sees other salons. Money results always include `provenance`. Notes, reviews and Zalo message text are passed as untrusted content (quoted), and they are never treated as instructions. Every call is audited (08/05).

---

## 9. AI-first deliverables

| Artifact | Path | Status |
|---|---|---|
| Task spec | `docs/tasks/07-salon-crm.md` | this file |
| Subagent | `.claude/agents/salon-crm.md` | created |
| Skill | `.claude/skills/salon-crm/SKILL.md` | created (UX rules, metric rules, procedures) |
| Domain doc | `docs/domains/salon-crm.md` | skeleton, to be filled as code lands |
| Metric registry | `packages/domain/metrics/registry.ts` | to implement in M7.8. It is the shared source for dashboards and agent tools. |
| ADR candidates | `docs/adr/` | (a) metric registry as the single source for dashboards and agent; (b) revenue provenance model; (c) OLTP queries first, rollups later |

---

## 10. Open questions for the product owner

1. **Multi-branch chains:** is per-branch tenant plus owner switcher OK for MVP, or do you need consolidated chain reporting at launch?
2. **Offline sale entry:** should "amount received" be prompted at every completion (better data, more friction) or be optional (default proposal: optional, with a daily-close reminder)?
3. **Packages / prepaid courses** (combo 10 buổi): very common in VN spas. Are they in MVP scope? They are not in the master prompt; the proposal is to defer, but reserve the model.
4. **Tips and commission for staff** (hoa hồng nhân viên): salons often track it in notebooks. In scope, or later?
5. **Staff visibility of their own ratings and earnings:** should the owner be able to toggle it (proposed), or is it always visible?
6. **Walk-in without a phone number:** allow fully anonymous walk-ins (proposed: yes, linkable later)?
7. **Devices:** are we targeting shared reception tablets (needs fast staff switching / PIN lock) at launch?
8. **AI features in the free tier:** is the price-list import in onboarding free (an acquisition hook) while the assistant chat is subscription-only? Proposed: yes.
