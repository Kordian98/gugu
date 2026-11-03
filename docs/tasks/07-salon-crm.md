# 07 — Salon SaaS / CRM (UX-first)

> The salon side of GuGu: the "today" view, calendar, booking operations, customer CRM, service/staff/profile management, onboarding and dashboards. It has to be extremely simple to read and operate, built around how Vietnamese salons actually work (Zalo, phone calls, walk-ins), and expose clean read models that both dashboards and the AI business agent (08) use.
>
> **Product priority (roadmap X13, owner q18):** GuGu is primarily a SaaS for salons and the marketplace is an addition. This CRM and its onboarding are the **core product**: when CRM work conflicts with marketplace work, CRM quality wins.
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
- Onboarding wizard, including AI-assisted import of a price list from a photo, PDF or pasted text of a **price board** (no personal data; see the PII rule in §8).
- Dashboard and reports: appointments, customers (new vs returning), no-show rate, utilization, popular services, staff utilization, revenue with explicit provenance labels.
- Read-model / metrics API (`/api/v1/salons/:salonId/insights/*`), shared by dashboards and the AI agent.
- Offline sale recording (manual "paid at salon" amount at completion). This is not payment processing.
- Staff pay and commission, monthly payroll (close, reopen, "paid on" bookkeeping, CSV/XLSX export), fixed monthly costs and the owner's "This month" profit estimate (owner request 2026-11-04, ADR-0014). Bookkeeping only: no payment processing, no tax or social insurance.

### Out (owned elsewhere)
- Slot algorithm, holds, concurrency, state machine → **06**.
- Roles, permission enforcement, RLS → **05**. This topic defines the CRM permission *needs*; 05 owns the matrix.
- Zalo OA connection, inbox transport, ZBS Template Messages (channel `zalo_template`; formerly ZNS) → **09**. This topic defines where Zalo shows up in the CRM UX.
- AI agent runtime, LLM, conversation storage → **08**. This topic defines the read models and tool candidates.
- Notification delivery → **11**. Attribution and commission ledger, subscriptions → **12**.
- Visual tokens and components → **02**. This topic sets the operational UX rules that apply on top of them.

---

## 2. Gap analysis

| # | Gap / issue in master prompt | Decision |
|---|---|---|
| G1 | No mention of **walk-ins**, which are a large share of traffic in VN nail and hair shops. | Walk-in is a first-class flow: one tap creates an "in-progress now" booking with source `walk_in`, gets the next free staff, and skips customer identification (an anonymous customer can be linked later). `walk_in` is in the single booking-source enum owned by 12 (roadmap X6). |
| G2 | No mention of **phone and Zalo bookings** entered by the receptionist. That is the dominant channel today: salons use notebooks, Zalo and Excel. | "Quick add" booking, under 15 s for a returning customer: phone-number-first search, recent customers, last service prefilled. Source `phone` / `zalo_chat` / `staff_created` from the 12-owned enum (X6). 07 never adds values locally. |
| G3 | "Customer CRM" has no dedupe or identity rules. Phone is the de-facto ID in VN, and customers change numbers or share family phones. | `CustomerSalonProfile` is keyed on salon + normalized E.164 phone (nullable for anonymous walk-ins). There is a merge-profiles action (owner/manager), audited. A GuGu account links to the profile when the phone is verified. |
| G4 | The dashboard KPI list is long. The prompt asks for it to be "simple to read", but a dense KPI dashboard is the opposite of that. | The home is **Today**, not analytics: a timeline of the day plus at most 3 status chips. Analytics lives in a separate "Insights" tab with at most 4 headline numbers, each expandable. Every metric has one canonical definition (§4.6). |
| G5 | Revenue labelling is mentioned but not modelled. | Each money figure carries `revenueKind: RevenueKind` (`estimated_from_bookings` | `recorded_offline_sale` | `reported_by_salon`), defined once in `packages/domain/metrics` and owned by 07 (roadmap X5). The UI shows a mandatory badge and tooltip. The figures never sum across provenance without a label. The words "payment" and "doanh thu đã thanh toán" are never used. |
| G6 | No **multi-location** model. A chain with two branches is common. | **At launch, Ultra plan only (owner q19, q75; entitlement `multi_location`):** `Organization` → many `Salon` (one location each; the salon stays the tenant). The workspace switcher shows each location plus **"Tất cả chi nhánh / All locations"**. Combined reporting: every metric supports `scope: salon \| organization`, and the organization scope sums or recomputes across the salons the member holds `insights.view_all` on. Operational screens (Today, Calendar, Clients) stay per location; there is no cross-location booking in MVP. Client profiles stay per salon, and cross-location client merge is out of scope. Org owners are owners of every salon in the org; managers can be scoped to one or more salons. Without Ultra, an owner can still own several separate salons (switcher only, no "All locations" or combined reporting), and adding a second location to an org shows an Ultra upsell. On a downgrade, the org data is kept but combined views lock. Schema and permission work goes to 04/05. |
| G7 | Staff "performance" is undefined and could feel punitive. | Show utilization, completed appointments, rebooking rate and average rating. Staff see only their own numbers, **always including their own ratings** (owner q23), and owner/manager see everyone's. |
| G8 | No offline or flaky-network behaviour for the calendar, although receptionists run it on cheap Android phones and tablets. | Read caching (TanStack Query persisted) with a visible "offline / last updated" banner. Writes require a connection in MVP: show a clear retry and never queue silently. Offline write queue is out of scope for MVP. |
| G14 | Combos and add-ons (owner q17, q21). | One service per appointment at launch. Combos are entered as a normal service ("Combo gel + chăm sóc da tay") or as **add-on options** on a service (each with its own price delta and extra duration, snapshotted on the booking). No prepaid packages (combo 10 buổi). **Staff commission is in scope since the owner request of 2026-11-04** (see G20); GuGu itself still takes no commission, and its own revenue is monthly/yearly SaaS subscriptions (12). |
| G15 | Devices (owner q23). | Both setups work without configuration: one shared reception tablet (fast "who is using this?" member switch with an optional 4-digit PIN, auto-lock after idle) or each person on their own phone. No device registration is required. |
| G16 | Contact visibility (owner q24). | Staff see client phone numbers by default: `client.view_contact` is in the staff default role, and the owner can revoke it per salon. |
| G17 | Clients without accounts (owner q20, X11). | Salons add clients with no GuGu account, and fully anonymous walk-ins are allowed and can be linked later. Customer self-service bookings arrive without OTP, flagged `identity_verified=false`. The CRM shows a subtle "unverified" marker, never a warning. A salon setting "Confirm bookings from new or unverified clients" is **off by default**, and GuGu shows a **one-tap suggestion** card on Today and in Settings after **3 no-shows from new or unverified clients within 30 days** (q69); it can be dismissed and does not reappear for 30 days. No-show history is visible only for the salon's own history with that client (q68). |
| G18 | Account deletion (owner q71). | After a customer deletes their GuGu account and the 30-day grace ends, their bookings in the salon stay but are anonymised as "Khách đã xoá / Deleted customer" (name, phone and contact removed; services, times, prices and revenue kept for metrics). The salon's **notes and tags about that customer are deleted**, and the client profile is detached from the account. The salon-created profile of a customer who never had an account is unaffected. The job is owned by 11 (privacy) and the CRM handles the anonymised state in every view. |
| G19 | Plans (owner q75). | **Basic:** CRM, calendar, AI onboarding import, marketplace listing. **Pro:** + AI assistant, monthly business review, Zalo inbox. **Ultra:** + multi-location chains with combined reporting, admin-level analytics. A 14-day Pro trial. Features are gated by 12 entitlements; the CRM shows locked features as calm upsells, never as broken UI. |
| G20 | Payroll and profit (owner request 2026-11-04). | Effective-dated pay per person (base none/monthly/per working day/hourly from schedules + default commission %, per-service/variant overrides as % or fixed VND). Commission per **completed booking line** for that line's staff (`booking_services.staff_id`); no-shows and cancellations earn nothing. Monthly payroll = base (pro-rated) + commission + bonus − deduction − advance, with a required reason on every adjustment, closed months read-only, audited reopen, "paid on" marks, CSV/XLSX. Owner "This month": earned so far, still to come, service costs, payroll, other monthly costs, estimated net profit and margins, with an optional no-show allowance labelled as an assumption. Owner by default; managers only by an owner grant. Staff see only their own estimate. Estimates before tax and insurance (no PIT/BHXH). ADR-0014. |
| G9a | Product owner rule (2026-11): **no personal data may be sent to any LLM** for now. | Every AI feature that needs personal data is **deferred**: paste-from-Zalo → booking draft, chat-to-booking, client search/profile/notes via the agent, agent-drafted bookings for named clients. The agent sees only aggregates and pseudonymous tokens (`staff_3`, `customer_17`), re-hydrated server-side after the model call by 08's PII firewall. Free text (notes, reviews, messages) is never sent. |
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
| **Tin nhắn / Inbox** | Zalo OA + in-app messages (09). **Pro+**; hidden if not connected | owner, manager, receptionist |
| **Thêm / More** | Insights, Services, Team, Salon profile, Grow, Settings, AI assistant entry | by permission |

- Global **"+" quick action** (FAB on mobile, `N` key on desktop): New booking · Walk-in · Block time · New client.
- Global **search** (`/` or `Cmd+K`): clients by phone or name (diacritic-insensitive), bookings by code, services.
- **AI assistant** (08) is a persistent button that opens a side panel on desktop and a bottom sheet on mobile, available in the **Pro** plan only (q31). Other plans show it as an upsell. AI setup in onboarding is in every plan.

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
| Paste from Zalo | ≤ 3 taps | **DEFERRED (PII rule, G9a).** The message would contain personal data, so for now the paste only fills the notes field and nothing is sent to an LLM. Later: an AI parser suggests client, service and time and the receptionist confirms. This is behind a feature flag and needs a subscription. Without it, the paste fills the notes field. |

### 3.5 Customer CRM
- Directory: search, filters (tag, last visit range, no-show ≥ N, new/returning, birthday this month), sort by last visit or visits. Virtualized list on mobile, table on desktop.
- Profile: header (name, phone, Zalo link state, tags), stats (visits, last visit, no-shows, estimated lifetime value labelled `estimated_from_bookings`), upcoming bookings, history, preferred services and staff (derived), **internal notes** (labelled "Only your team sees this"; never returned by customer-facing APIs; separate table and permission), and consent flags (marketing via Zalo/SMS).
- Actions: book again (prefilled), call, open Zalo chat (09), add note, tag, merge, export (owner only, audited).
- Tags are salon-defined plus system tags (`VIP`, `new`, `at_risk` = no visit in 2× their average interval). System tags are computed, not editable.

### 3.6 Management
- **Services:** a list grouped by category with drag reorder. The editor covers name (vi + en, vi required), category, duration, buffer, price or price range, variants (each with its own price and duration), **add-on options** (price delta + extra duration; this is how combos are modelled), assigned staff, per-staff price override, active toggle, and booking restrictions (min notice, max advance, online-bookable toggle). Changes never touch existing bookings, because bookings keep snapshots (04/06).
- **Team:** invite by a share link (copy / Zalo / QR) or an email link. There is no SMS (roadmap X12). Profile, role (owner/manager/receptionist/staff), weekly schedule grid with breaks, time off, assigned services and an individual calendar link. The permission UI shows plain-language toggles mapped onto the 05 matrix.
- **Salon profile:** everything listed in §13 of the master prompt, plus a live preview of the public page (10).
- **Hours and holidays:** a weekly template plus exceptions and a VN public holiday suggestion list (Tết etc.) that is opt-in per year and stored in the DB.
- **Policies:** booking policy, cancellation window (hours), and a no-show policy text shown to customers.

### 3.7 Onboarding wizard (target: first bookable state in under 10 minutes)

**"Effortless AI setup" / "Thiết lập bằng AI trong vài phút"** is the headline path and a marketing feature (roadmap X13, owner q42). It is available in **every plan**, including free.

**Path A (default, first card): AI setup from screenshots**
1. "Chụp hoặc tải lên bảng giá của anh/chị": upload 1–10 photos or screenshots of the current price board, menu, Facebook/Zalo price post, Excel sheet or old booking app, or paste the price text.
2. PII guard (X10): text found on the device and on the server is scanned. Phone numbers, emails and person names are stripped, and an image area that looks like a chat with a person's name or avatar is rejected with a friendly "please crop to just the price list" hint. Nothing personal reaches the LLM.
3. AI (08) extracts categories, services, variants (e.g. short/medium/long), add-on options, prices (VND, including ranges like "150–250k"), and durations when present. It suggests durations from category defaults when they are missing, marked "estimated".
4. Review table: grouped by category, with low-confidence cells highlighted and inline edit, merge, split and delete. Bulk actions: "set duration for all in category" and "assign all to me". A side-by-side source image is shown on desktop.
5. Confirm → services are created. Nothing is published without this confirm, and the import is audited (who, which source media, model version).
6. The AI also proposes opening hours if the image shows them, as a suggestion to confirm on the hours step.

**Path B:** pick from category templates. **Path C:** add manually.

Wizard steps:
1. Business basics: name, category, phone, address with a map pin, and "one location or several?" (creates the Organization when there are several; G6).
2. Services (Path A/B/C above). This comes **before** hours so the "aha" moment happens in the first minutes.
3. Hours: template presets ("9:00–21:00 every day" is common), prefilled from AI if detected.
4. Team: "Just me" or add staff (name plus services) and invite them by link.
5. Photos: logo, cover, gallery (optional, can skip).
6. Go live: show the share link and QR code, plus an optional Zalo OA connect step (09).

Progress is saved after each step. A checklist card on Today shows the remaining setup until it is complete. For chains, an additional location can **copy services, hours and team** from an existing one.

Metrics for the marketing claim (tracked through 12 analytics): the median time from sign-up to first bookable state, and the share of salons that used AI setup. Target: median under 10 minutes and under 3 minutes of hands-on time for Path A.

### 3.8 Insights (analytics)
- Four headline cards: appointments, new vs returning customers, no-show rate, estimated revenue (badge). Period picker: today / 7 d / 30 d / custom. Each card shows a comparison with the previous period.
- Drill-downs: popular services, staff utilization, cancellation reasons, booking sources (attribution, no commission data shown here unless 12 enables it).
- Every number links to its metric definition (an "i" icon) that uses the same text as the metric registry (§4.6).
- Staff see only personal insights.
- Chains (**Ultra**): the period picker sits next to a location picker ("All locations" or one location). Organization-scope cards show a per-location breakdown on tap.

### 3.9 Empty, loading and error states
Every list and panel ships all three states, with a localized copy key per screen.
- Empty states are actionable: "No services yet → Import price list / Add service", or "No bookings today → Share your booking link".
- Skeletons match the final layout, with no spinners on full screens.
- Errors are human, localized and give a retry. Server error codes map to i18n keys (03).

### 3.10 Revenue kinds (hard rule, roadmap X5)
`RevenueKind` lives in `packages/domain/metrics/revenue-kind.ts` (owner: 07). 08 and 12 import it and never redefine it.
- `estimated_from_bookings`: the sum of booking price snapshots for completed bookings (ranges use the min price, flagged).
- `reported_by_salon`: periodic totals the salon enters manually (optional "daily close" form).
- `recorded_offline_sale`: an amount entered at completion for a specific booking.
- The UI badge text is "Ước tính / Estimated", "Salon báo cáo / Reported" or "Đã ghi nhận tại salon / Recorded at salon". None of these may be labelled payment, paid, or verified.

### 3.11 Calm mode inherits the GuGu brand
The visual reference `design/hero-references/ref-01-homepage-lilac-diorama.png` (lilac/pink, gen-z) drives the **expressive** marketing surfaces (02). The CRM uses **calm** mode: it is the same product with the volume turned down.
- **Kept from the brand:** the type families (the display serif only for page titles and the Insights headline numbers; UI sans for everything else), radii (large rounded cards, pill buttons and chips), the deep plum/near-black primary button, the lilac accent for selection, focus, the active nav item and the current-time line, and soft pink/lilac tints for status and service colour stripes.
- **Dropped in calm mode:** 3D, glass and iridescent effects, gradients on text, handwritten script accents, decorative stickers and hearts, large hero imagery, and parallax or ambient motion. Motion is limited to functional transitions (≤ 200 ms, reduced-motion respected).
- **Surfaces:** a warm off-white background and white cards with hairline borders instead of shadows. Lilac is used only as an accent, never as a large fill behind dense data.
- **Light and dark (roadmap X18):** the CRM workspace supports light and dark themes: follow the system setting by default, with a per-user override (System / Light / Dark) in Settings that persists on the account and device. Dark calm mode uses 02's dark calm tokens (deep plum-tinted neutrals, lilac accent kept, AA contrast re-verified, status colours tuned for dark). Dark mode exists **only** in the business workspace (and platform admin, which 12 owns). The public profile preview inside the CRM (§3.6) and any public or customer screen always render light.
- **Implementation:** the same tokens through the `calm` surface mode from 02. No CRM-only colours; any new need goes back to 02 as a token request.

### 3.12 Accessibility and readability
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

### 4.6 Metric catalogue (layered on read models, roadmap X7)
Layering: **04 read-model registry** (backend queries + permission + tenant scope + untrusted-field flags) → **07 metric catalogue** (this section; every metric references one or more read models and adds definition, unit, grain and `revenueKind`) → **08 tool registry** (generates agent tools from read models and metrics). 07 does not query tables directly for metrics; it goes through 04 read models. The interfaces are fixed in roadmap Step 3 (`A0`).
`packages/domain/metrics/registry.ts` holds a typed list of metric definitions:
`{ key, readModels[] (04 ids), labelKey (i18n), definitionKey (i18n), unit, revenueKind?, grain, dimensions[], permission, query handler name }`.
Used by:
1. API: `GET /insights/metrics/:key?from&to&groupBy` validated against the registry.
2. Dashboards: render cards from the registry.
3. AI agent (08): the 08 tool registry generates tools from the catalogue and the read models, so there is one definition for both humans and the LLM.

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
| `revenue.estimated` | Sum of price snapshots, completed bookings. Kind `estimated_from_bookings`. |
| `revenue.offline_recorded` | Sum of OfflineSale. Kind `recorded_offline_sale`. |
| `revenue.reported` | Sum of SalonReportedRevenue. Kind `reported_by_salon`. |
| `bookings.by_source` | Count by attribution source (from 12). |
| `rebooking.rate` | Customers completing again within N days (default 60). |
| `profit.*` | "This month" profit view (window `month`, permission `payroll.read`, ADR-0014): `revenue_earned`, `revenue_earned_recorded`, `revenue_upcoming`, `no_show_allowance` (assumption), `revenue_total`, `service_costs`, `payroll` (team total), `other_costs`, `net`, `gross_margin`, `net_margin`, `month_progress`. Definitions in the registry. |

All metrics are computed in the salon timezone with day boundaries in `Asia/Ho_Chi_Minh` by default.

### 4.7 Zalo touchpoints (contracts for 09)
- Client profile: `zaloLinkState` (not_linked / follower / linked) and an "Open chat" deeplink or in-app inbox thread.
- Booking detail: a "Send confirmation via Zalo" status from the notification log (11/09).
- Inbox: a thread list keyed to `CustomerSalonProfile`, with a "Create booking from this chat" action that prefills only the client (no AI). AI parsing of chat text is **deferred** (G9a).
- All of these degrade gracefully when Zalo is not connected.

### 4.8 Permissions needed (input for 05)
Payroll (implemented, ADR-0014): `payroll.read`, `payroll.manage` (owner; grantable to managers only, `MANAGER_GRANTABLE_PERMISSIONS`), `payroll.self.read` (every role, own estimate only).

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
8. **Revenue labels:** every money value in the UI has a revenue-kind badge, and a lint/test fails if a money component renders without `revenueKind`.
9. **Metric registry:** every dashboard number comes from a registry key, and the same key is callable through the agent tool layer with identical results (snapshot test).
10. **Onboarding:** AI setup from screenshots works in every plan, a PII canary test (a screenshot containing a phone number and name) shows nothing personal reaching the LLM, and a fresh salon reaches "bookable" (at least 1 service, hours, 1 staff) in a timed usability test under 10 minutes. AI import produces an editable draft and never publishes without confirmation.
11. **States:** every screen has empty, loading and error states (checklist plus Storybook/visual stories).
12. **i18n:** zero hardcoded strings in `features/salon-crm` (lint rule from 03), and both locales verified on Today, Calendar, Client profile and Insights.
13. **Chains (Ultra):** on Basic or Pro, combined views are locked with an upsell (entitlement test). An Ultra owner of a 2-location org sees combined Insights equal to the sum or recomputation of each location, and a manager scoped to one location cannot see the other (integration test).
14. **Shared tablet:** member switch takes 2 taps (plus PIN if enabled), and it auto-locks after the configured idle time.
15. **Permissions:** staff role sees only their own calendar and insights, and the receptionist cannot see revenue unless granted. Staff see client phones by default and lose them when the owner revokes `client.view_contact` (integration tests).
16. **Deleted customer:** after the anonymisation job runs, the CRM shows "Deleted customer" on past bookings, metrics stay unchanged, and the notes and tags for that profile no longer exist (integration test).
17. **Themes:** every CRM screen passes AA contrast in both light and dark (visual snapshots in both themes); the theme override persists across sessions; the public profile preview renders light while the CRM is dark.
18. **Payroll (ADR-0014):** a two-staff chain splits commission by line; no-shows/cancellations earn nothing; month boundaries follow the salon timezone; a closed month is read-only and reopening is audited; adjustments need a reason and are audited; staff see only their own pay, a manager without the owner's grant gets 403, other salons 404; profit tiles equal the registry values and the assistant tool returns no per-person pay (integration + Playwright).

---

## 6. Dependencies

| Topic | Need |
|---|---|
| 01 | Monorepo, app routing groups, api-client generation |
| 02 | Tokens and components; the operational density variant ("calm" UI mode) |
| 03 | i18n keys, VND and date formatting, error-code mapping |
| 04 | Read-model registry that the metric catalogue builds on (X7). Schema: CustomerSalonProfile, CustomerNote, tags, OfflineSale, SalonReportedRevenue, salon_daily_stats |
| 05 | Permission matrix (§4.8), tenant guard, audit log for merge, export and notes |
| 06 | Calendar feed, create/reschedule/cancel/status endpoints, conflict suggestions, walk-in "start now" |
| 08 | PII firewall (tokenisation and re-hydration), AI price-list import (no personal data), assistant panel, tools from the metric catalogue. Chat-to-booking parse is deferred. |
| 09 | Inbox, Zalo link state, OA connect step in onboarding |
| 10 | Public profile preview, share link |
| 11 | Customer notification on salon-side changes, notification log status |
| 12 | Owns the booking-source enum (X6). The CRM uses `walk_in`, `phone`, `zalo_chat`, `staff_created`, `qr_code`, `direct_link`, and `ai_agent` for agent-drafted bookings. Also: subscription gating for the AI and Inbox features, feature flags |
| 13 | Playwright E2E, device test matrix |

---

## 7. Suggested sub-milestones

1. **M7.1 Shell and Today (read-only):** workspace layout, role-aware nav, salon switcher, Today timeline from the 06 feed, empty, loading and error states.
2. **M7.2 Booking ops:** quick add, walk-in, check-in, complete, no-show, cancel with undo/confirm policy; booking detail sheet.
3. **M7.3 Calendar:** desktop staff grid with drag/resize and keyboard; mobile staff day view and agenda; block time.
4. **M7.4 Services and team management:** services and variants editor, team invite, schedules, time off, permissions UI.
5. **M7.5 Salon profile, hours, holidays and policies,** with a public preview.
6. **M7.6 Onboarding wizard (every plan):** **AI setup from screenshots (Path A, every plan)** plus template and manual paths, the setup checklist on Today, and "copy from location" for chains. This is core-product priority, so pull the AI extraction part of 08 forward into this milestone instead of waiting for M7.9.
7. **M7.7 CRM:** directory, profile, notes, tags, merge, consent flags.
8. **M7.8 Metric registry and Insights,** plus OfflineSale and the reported revenue form.
9. **M7.9 AI hooks:** assistant panel entry (Pro plan only, owner q31, with a hard monthly cost cap, q32) over aggregate and tokenised tools (with 08). Paste-from-Zalo parse is deferred until the PII rule changes.
10. **M7.10 Zalo surfaces:** inbox, link state, create booking from chat (client prefill only, no AI parsing per X10) (with 09).

M7.1–M7.5 map to Phase 2 of the master plan. M7.7–M7.8 belong late in Phase 2 or Phase 3. M7.9–M7.10 come after 08 and 09 foundations.

---

## 8. Product AI-agent surface

Per X7, 08 generates these from the 04 read-model registry and the 07 metric catalogue. The CRM-specific read tools below map to 04 read models. Every tool is tenant-scoped by the server from the session (never from model input) and permission-checked as the asking member.

| Tool | R/W | Input / output | Permission | PII level | Confirmation |
|---|---|---|---|---|---|
| `insights.get_metric` | R | `{ key, from, to, groupBy? }`. `groupBy=staff` returns tokens (`staff_3`) | per metric (`insights.view_all` / `revenue.view`) | aggregate | — |
| `insights.list_metrics` | R | `{}` | any member | none | — |
| `calendar.get_day_summary` | R | `{ date, staffToken? }` → counts by hour, status, and staff token | `calendar.view_all` / `view_own` | aggregate + tokens | — |
| `services.popular` | R | `{ from, to }` → service names + counts (service names are business data, not PII) | `insights.view_all` | aggregate | — |
| `clients.segment_counts` | R | `{ segment: new\|returning\|at_risk\|vip }` → counts and tokenised list (`customer_17`, last visit, visits). No names or phones | `client.view` | aggregate + tokens | — |
| `availability.suggest_slots` | R | `{ serviceId, variantId?, staffToken?, date }` → 06 | `booking.create` | tokens | — |
| `month_profit` | R | `{ date }` (any day of the month) → salon totals: earned so far (+ recorded part), still to come, no-show allowance, service costs, **team payroll as one total**, other costs, net profit, gross/net margin, progress. **No per-person pay, salary or commission** (personal data, X10); no staff dimension in the schema; salary canary in evals | `payroll.read` | aggregate | — |
| `services.import_draft` | W | `{ sourceMediaId or text }` of a price board, PII-scanned and rejected if it contains phones or names → draft table | `service.manage` | none (rejected if found) | **required** |
| ~~`bookings.search`~~, ~~`clients.search`~~, ~~`clients.get_profile`~~, ~~`clients.add_note`~~, ~~`bookings.create_draft`~~, ~~`bookings.reschedule_draft`~~ | — | **Deferred (G9a)**: these need names, phones, notes or free text | — | — | — |

**PII rule (G9a):** every read model or metric exposed to the agent MUST be aggregate or tokenised. Tokens are stable within a conversation, mapped and re-hydrated server-side by 08's firewall, and never derived from names or phones. Each 04 read model used by a tool declares `piiLevel: none | aggregate | tokenised`, and a test fails if a tool output contains names, phones, emails, notes, review or message text. The source `ai_agent` (X6) is reserved for when agent booking drafts return. Rules: the agent never sees other salons. Money results always include `revenueKind`. Every call is audited (08/05).

---

## 9. AI-first deliverables

| Artifact | Path | Status |
|---|---|---|
| Task spec | `docs/tasks/07-salon-crm.md` | this file |
| Subagent | `.claude/agents/salon-crm.md` | created |
| Skill | `.claude/skills/salon-crm/SKILL.md` | created (UX rules, metric rules, procedures) |
| Domain doc | `docs/domains/salon-crm.md` | skeleton, to be filled as code lands |
| Metric registry | `packages/domain/metrics/registry.ts` | to implement in M7.8. It is the shared source for dashboards and agent tools. |
| ADR candidates | `docs/adr/` | (a) metric registry as the single source for dashboards and agent; (b) `RevenueKind` model; (c) OLTP queries first, rollups later |

---

## 10. Open questions for the product owner

Resolved by the product owner (tracker answers; kept here for traceability):

| q | Decision | Where applied |
|---|---|---|
| q18 / X13 | SaaS-first; CRM and onboarding are the core product | header, priority |
| q19 | Multi-location chains with combined reporting at launch | G6, §3.8, AC 13 |
| q20 | Clients without accounts and anonymous walk-ins allowed | G1, G17 |
| q21 | No prepaid packages, no staff commission; SaaS subscriptions only | G14 |
| q17 | One service per appointment; combos as services or add-on options | G14, §3.6 |
| q22 | Amount received is optional | §3.4, §4.5 |
| q23 | Staff see their own ratings; one or many devices both supported | G7, G15, AC 14 |
| q24 | Staff see client phones by default | G16 |
| q27 | CRM tone uses "anh/chị" | skill UX rule 6 |
| q42 | AI setup from screenshots in every plan, marketed as effortless | §3.7, M7.6 |
| q31 / q32 | Assistant in Pro only, with a hard cost cap | §3.1, M7.9 |
| q65 | Personal data to an LLM only after legal review and explicit consent | G9a |
| q69 | Suggest confirmation after 3 no-shows from new or unverified clients in 30 days, one tap | G17 |
| q71 | After deletion + 30-day grace: bookings anonymised, salon notes and tags deleted | G18, AC 16 |
| q75 | Basic / Pro / Ultra plans, 14-day Pro trial; multi-location is Ultra only | G6, G19 |
| X18 | Dark mode only in the CRM workspace (and admin); public and customer surfaces light-only | §3.11, AC 17 |
| q66 / q68 | Confirm-new-clients setting off by default; no-show history per salon only | G17 |
| owner 2026-11-04 | Staff pay, commission, payroll and monthly profit estimate (supersedes "no staff commission" in q21's reading) | G14, G20, ADR-0014 |

Still open: q98 (Vietnamese social insurance and PIT on payroll: later or never?), q99 (no-show allowance on by default?), q100 (team pay total in the assistant for very small teams) — see the tracker.
