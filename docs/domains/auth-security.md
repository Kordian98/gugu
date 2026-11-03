# Auth & security domain

Durable reference for identity, sessions, authorization, tenant isolation, audit and privacy in GuGu. Read this before changing anything in `apps/api/src/modules/{auth,authorization,audit,privacy,salons}`, `apps/api/src/common/guards`, `packages/domain/src/auth` or `apps/app/services/auth`. Requirements and rationale: `docs/tasks/05-auth-security.md`.

## Status

**X21/X23 (2026-11-02): staff/owner auth only.** Sign-in, sessions and `/me` are for salon staff/owners (and later platform admins). Customers never authenticate: no customer accounts, no public salon page, no guest manage/confirm links (X23). Sign-up no longer creates a `customers` row (branch auth/05-x23); sign-in copy speaks to salon teams ("GuGu Studio").

**Step 3 implemented** (spec milestones 1–5, X11/X12, q24/q71/q72): identity and tenancy schema, email magic link, web and native sessions, Apple/Google backend (disabled until configured), guards with the permission matrix, default-deny boot check, audit log, salon registration with trial (topic 12), generated cross-tenant suite. Web sign-in works end to end.

**Step 8 (privacy, salon side) and step 9 (admin TOTP step-up) implemented** on branch `auth/05-privacy-totp` (ADR-0011, ADR-0012): owner-only client export and erasure, salon-wide async export, retention purge; platform-admin TOTP enrolment, recovery codes, session-bound step-up, enrolment required for every admin write, per-user admin rate limits. See [Privacy](#privacy) and [Admin second factor](#admin-second-factor).

Not implemented yet: RLS policies (milestone 6), consent records table (R40), admin passkeys and read-only impersonation (rest of milestone 9), agent principal (milestone 10), Zalo Login (hidden, q28), session list UI, client-side Apple/Google SDKs, QR rendering for TOTP enrolment. Native sign-in was type-checked only; it has not been run on an iOS/Android dev build.

## Summary

- **Who signs in:** salon staff/owners only (X21/X23). Customers are CRM records, never users.
- **Sign-in:** email magic link (link + 6-digit code), Apple and Google ID tokens. Zalo Login is hidden until the central OA exists. No SMS or SMS OTP for now (X12).
- **Customer-facing booking:** out of scope (X23). The OTP-less guest design (X11, spec §3.11) is deferred.
- **Sessions:** web = httpOnly `gugu_session` cookie (`__Host-gugu_session` + `Secure` in production), SameSite=Lax, 30-day sliding, 90-day absolute, with a CSRF header on writes. Native = opaque 15-minute access token + rotating refresh token in SecureStore. Reusing a spent refresh token revokes the session. The tokens are opaque rather than JWTs because every request already checks the session and membership in the database, so revocation is immediate (R13).
- **Authorization:** a global `AuthGuard` + exactly one policy decorator per route + a `SalonContext` resolved from memberships on every request. Foreign salon → 404, missing permission → 403. RLS is planned as defense in depth (milestone 6).
- **Non-human principals** (later): the AI agent acting on behalf of a member, the Zalo integration, system jobs.
- **Audit:** append-only `audit_logs` (a trigger rejects UPDATE/DELETE).
- **Environments:** localhost only for now (X16). Target hosting is AWS ap-southeast-1, later. Accounts are held by the owner's Polish company. Legal review is postponed (q04) and required before public launch. Privacy is designed against Law 91/2025/QH15 and Decree 356/2025/ND-CP concepts; GuGu makes no compliance claim.

## Invariants

The canonical list is in `.claude/skills/tenant-authorization/SKILL.md#invariants`.

## Model

Tables are in migration `20261102115341_add_identity_tenancy`. Raw objects are listed in `apps/api/prisma/raw-objects.json`.

| Table | Purpose | Notes |
|---|---|---|
| `users` | Identity | `email` citext unique; `email_verified_at`; `phone_e164` (unverified); `status`; `platform_role`; deletion fields (30-day grace, q39) |
| `user_profiles`, `customers` | Profile; `customers` table is legacy (no longer written) | Kept for now (no destructive migration); drop with a later contract migration once nothing references it |
| `auth_identities` | Apple/Google/Zalo subjects | `UNIQUE (provider, subject)` |
| `sessions` | One per sign-in | `token_hash` = HMAC of the cookie secret or the current access token |
| `refresh_tokens` | Native rotation chain | `used_at` set on use; reuse → session revoked |
| `magic_link_tokens` | Email links | `token_hash` + `code_hash` (HMAC); `attempts` ≤ 5; TTL 15 min; `purpose` sign_in / salon_registration |
| `organizations`, `organization_members` | Organisation and roles `org_owner/org_manager/org_viewer` | q19; org roles act as owner/manager on every salon of the org |
| `salons`, `salon_locations`, `salon_members` | The tenant, its address, salon roles | One live owner per salon (partial unique index `salon_members_one_owner`) |
| `locations` | Province → ward (post-2025 two-level model) | **Stub data** (`stub-*` codes) until topic 10 imports the official dataset |
| `service_categories` | The initial 10 categories | Seeded in the migration |
| `audit_logs` | Append-only trail | Trigger `audit_logs_no_update_delete` |

Migration `20261102122228_add_subscription_salon_fks` adds `salon_id → salons(id)` FKs to `subscriptions`, `subscription_events` and `entitlement_overrides` (topic 12).

## API

| Route | Policy | Notes |
|---|---|---|
| `GET /api/v1/auth/providers` | public | Which sign-in buttons to show |
| `POST /api/v1/auth/magic-link` | public | Always 202 `{status:"sent"}`. Limits: 30/15 min per IP prefix here; 3/15 min and 10/day per email (hashed) are enforced inside `MagicLinkService.issue()`, so registration emails count too |
| `POST /api/v1/auth/magic-link/verify` | public | `{token}` or `{email, code}` + `client`. Wrong codes count only against the live link they were tried on: after 5 its *code* is locked (429), but its emailed token still works and a newer link is unaffected — so third parties can't lock anyone out. Guessing is bounded by issuance: ≤ 10 links/day × 5 = 50 guesses per email per day. Web sets the cookie and returns `csrfToken`. Native returns tokens |
| `POST /api/v1/auth/social` | public | Apple/Google ID token. 404 `auth.provider_disabled` when not configured |
| `POST /api/v1/auth/refresh` | public | Native refresh rotation |
| `POST /api/v1/auth/sign-out`, `/sign-out-all` | authenticated | Revokes the session(s) and clears the cookie |
| `GET /api/v1/me` | authenticated | User, memberships, web `csrfToken` |
| `GET /api/v1/me/pending-salons`, `POST …/:salonId/confirm`, `POST …/:salonId/decline` | authenticated | Explicit confirm/decline of salons registered with my email (audited `salon.owner_verified` / `salon.owner_declined`) |
| `GET /api/v1/public/categories`, `/public/locations` | public | Reference data for registration |
| `POST /api/v1/salons/registrations` | public | Signed in → owner at once. Anonymous → `email` required, memberships `pending_verification`. Only that salon's registration link activates it; otherwise the owner confirms explicitly after signing in (`/me/pending-salons`). When the per-email limit is hit, the salon is still created and `magicLinkStatus` is `rate_limited`. Starts the 14-day trial in the same transaction |
| `GET/PATCH /api/v1/salons/:salonId`, `GET …/members` | `salon.read` / `salon.profile.write` / `members.read` | Minimal workspace read models |
| `GET /api/v1/salons/:salonId/entitlements` | `subscription.read` | Topic 12, guarded by the membership guard |
| `GET /api/v1/salons/:salonId/customers/:customerId/export?locale=` | `customers.export` (owner) | One client's data as JSON + readable text; audited `privacy.client_exported` |
| `POST /api/v1/salons/:salonId/customers/:customerId/erase` `{confirm:true}` | `customers.erase` (owner) | Irreversible erasure (see Privacy); audited `privacy.client_erased` |
| `GET/POST /api/v1/salons/:salonId/privacy/exports`, `GET …/:exportId/download?format=json\|csv` | `customers.export` (owner) | Salon-wide async export; one in flight, 3/day; download in the panel only, 24 h; audited |
| `GET /api/v1/admin/mfa`, `POST …/totp/enrol`, `…/totp/confirm`, `…/step-up`, `…/recovery-codes` | `platform.mfa.self` (both platform roles) | Admin second factor (ADR-0011); salon members 403, anonymous 401 |

Errors: `AUTH_ERRORS` (`packages/contracts/src/auth/auth.ts`), `SALON_ERRORS` (`packages/contracts/src/salon/registration.ts`), `ADMIN_MFA_ERRORS` (`packages/contracts/src/auth/admin-mfa.ts`), `PRIVACY_ERRORS` (`packages/contracts/src/privacy/privacy.ts`).

## Flows

- **Magic link (web):** request → SMTP email (Mailpit locally; vi/en, `email` namespace) → `/{locale}/auth/verify?token=…` → `POST verify` → cookie + `csrfToken` → redirect to `redirectPath` or `/{locale}/me`. On reload, `GET /me` returns the CSRF token again; it is kept in memory only.
- **Magic link (native):** request with `client: "native"` → the user types the 6-digit code → tokens go to SecureStore. Universal links for the emailed URL come with topic 13.
- **Client IP:** `req.ip` comes from Express `trust proxy`, set from `TRUST_PROXY` (default `false` = no proxy, local). Behind Cloudflare/a load balancer set the hop count (e.g. `1`) or the proxy CIDRs; never `true`. IP limits are the first layer; per-email/per-account limits are the second.
- **Refresh:** `apiFetch` refreshes once on 401, with one in-flight refresh shared by concurrent calls.
- **Salon registration (anonymous):** a user row is created unverified → org, salon, memberships and trial are created in one transaction → after commit, a `salon_registration` magic link is emailed → verifying it activates **only that salon** (audit `salon.owner_verified`). A plain sign-in activates nothing: the app routes users with pending salons to `/{locale}/auth/pending-salons` to confirm or decline each one.
- **Admin step-up:** admin opens a high-risk action → API 403 `admin.step_up_required` → the sheet asks for the authenticator code → `POST /admin/mfa/step-up` sets `sessions.step_up_until = now + 10 min` → the sheet retries the action. Without an enrolled factor every admin write answers 403 `admin.mfa_enrollment_required` and the panel links to `/{locale}/admin/security`.
- **Client erasure (owner):** client card → "Xoá dữ liệu của khách" → confirm → one transaction (profile/notes deleted, bookings anonymised, Zalo content deleted) → upcoming bookings cancelled after commit (`reasonCode client_data_erased`, actor system).
- **Salon export (owner):** Settings → "Dữ liệu và quyền riêng tư" → "Tạo bản xuất" → `privacy` queue job builds gzipped JSON + CSV → the panel polls and offers the downloads for 24 h.
- Agent tool authorization, Zalo webhook ingest: _TBD_ (later milestones).

## Enable Apple / Google

1. Create the OAuth clients (Google: Web + iOS + Android client IDs; Apple: Services ID for web, bundle ID for iOS).
2. Set `GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS` (comma-separated) in `.env`. `GET /auth/providers` then reports them enabled and the sign-in screen shows the buttons.
3. **Still TODO:** wire the client SDKs (Google Identity Services / `expo-auth-session` or native Google Sign-In, `expo-apple-authentication`) so the buttons obtain an ID token and call `POST /auth/social`. The backend verifies signature (JWKS), issuer, audience and expiry, and links to an existing account only when the provider has verified the email (R5).

## Permission matrix

The source of truth is `packages/domain/src/auth/permissions.ts`, tested in `permissions.test.ts`. Permission strings use the form `resource.action[.own]`. Staff see customer phone numbers by default (q24). Owner-only permissions (`salon.delete`, `members.roles.write`, `customers.export`, `integrations.zalo.manage`, `billing.manage`) can't be granted through overrides.

Topic 05 step 8 added `customers.erase` (owner-only, never grantable) next to `customers.export`. Step 9 added `platform.mfa.self` for both platform roles (manage one's own second factor).

Platform roles (`users.platform_role`: `support_admin`, `super_admin`) are not salon memberships and grant only `platform.*` permissions; no salon role carries one (matrix test). Topic 12 M12.6 added `platform.usage.read` (both), `platform.subscriptions.write`, `platform.entitlements.write`, `platform.founding_partner.write` (super_admin) and gave `support_admin` `platform.audit.read` (spec 12 R-AD4). Matrix per admin action: `docs/domains/monetization-admin.md#admin-permissions`. A suspended salon (`salons.status = suspended`) keeps read access; the guard refuses every non-GET salon route with 403 `salon.suspended` (ADR-0010). There is no API to grant platform roles yet (`platform.roles.write` is unused); local dev uses `apps/api/scripts/seed-platform-admin.mjs`.

## Audit events

`AUDIT_ACTIONS` in `apps/api/src/modules/audit/audit.service.ts`: `auth.sign_in`, `auth.sign_out`, `auth.sign_out_all`, `auth.session_reuse_detected`, `auth.identity_linked`, `salon.registered`, `salon.owner_verified`, `salon.owner_declined`, `salon.profile_updated`, plus topic 12 `admin.*` actions (metadata `{ reason, platformRole, before, after }`, actor type `platform_admin`), step 9 `admin.mfa_enrolled`, `admin.mfa_reset`, `admin.mfa_step_up` (`method: totp | recovery_code`), `admin.mfa_step_up_failed`, `admin.mfa_recovery_codes_regenerated`, and step 8 `privacy.client_exported`, `privacy.client_erased`, `privacy.salon_export_requested`, `privacy.salon_export_downloaded` (counts/format only), `privacy.retention_purged` (system, counts). Metadata never holds secrets or personal data.

## Data inventory

Processing location: localhost only for now (X16); later AWS ap-southeast-1. GuGu makes no compliance claim; legal review pending (q04).

| Field | Table | Purpose | Retention | Visible to |
|---|---|---|---|---|
| email | users, magic_link_tokens, auth_identities | Sign-in, contact | Until account deletion (+30-day grace); magic links deleted 1 day after expiry | User; GuGu support |
| phone_e164 | users, salons | Contact (unverified) | Same | Salon team (q24) |
| ip_prefix (/24, /48), user_agent | sessions, magic_link_tokens, audit_logs | Security | Sessions deleted 30 days after they end; audit: TBD (legal) | Platform admins; salon owner (own audit) |
| token/code HMACs | sessions, refresh_tokens, magic_link_tokens | Authentication | Until expiry/revocation, then purged by `privacy.retention` | Nobody |
| TOTP secret (sealed), recovery-code HMACs, `step_up_until` | admin_mfa_factors, admin_recovery_codes, sessions | Admin second factor | Until re-enrolment | Nobody (secret shown once at enrolment) |
| client name, phone, tags, marketing consent | customer_salon_profiles | Salon CRM (the salon is the likely controller, q80) | Until the salon erases the client | Salon team per permissions |
| booking contact snapshot (name, phone, email, note) | bookings | Appointment | Kept for the salon's history; anonymised on client erasure | Salon team |
| internal notes | customer_notes | Salon CRM, potentially sensitive (R42) | Deleted on client erasure (q71) | Members with `customers.notes.write` |
| Zalo chat text, display name, phone | zalo_messages, zalo_conversations, zalo_webhook_events | Salon inbox and booking bot | Raw events 30 days; messages until client erasure | Members with `zalo.inbox.use` |
| recipient hash (sha256 of canonical email) | notification_deliveries | Email abuse caps (24 h) | Cleared after 48 h; rows deleted after 12 months | Nobody (ids/codes only) |
| salon-wide export files | privacy_exports | Owner's data export | Content purged 24 h after completion | Salon owner |

## Privacy

Owner tools, ADR-0012. Designed to support data-subject requests handled by the salon (q80); no compliance claim.

- **Export one client** (`customers.export`): JSON `gugu.client-export.v1` + readable text (vi/en, `privacy` namespace). Covers the profile (+ merged profiles), bookings matched by phone (services, payment, status history), notes, Zalo conversations (by phone or linked to those bookings) with messages, and customer notification log rows.
- **Erase one client** (`customers.erase`): see ADR-0012 §3 for exactly what is deleted, anonymised and kept. Bookings show "Khách đã xoá tài khoản" / "Deleted customer" in the CRM. Assistant entity tokens hold no client data and are kept.
- **Salon-wide export:** async (`privacy` queue), JSON + CSV, panel-only download for 24 h.
- **Retention** (`privacy.retention`, daily, `RETENTION` in `modules/privacy/application/retention.service.ts`): notification deliveries and bell items 12 months; recipient hashes 48 h; ended sessions 30 days; magic links 1 day after expiry; idempotency keys at expiry; export content 24 h; stuck exports failed after 6 h. Zalo raw events: 30 days (zalo module). Audit logs: until the legal review sets a period.
- Not built: consent records table (R40), customer-account deletion flow (no customer accounts, X23; the `anonymiseCustomer` hook stays for later).

## Admin second factor

ADR-0011. TOTP (RFC 6238) for platform admins; passkeys are the planned primary factor (q72).

- Every admin write needs an enrolled factor; suspend/unsuspend, founding-partner revoke, override creation and plan assignment also need a step-up of the current session (10 min).
- Recovery codes: 10, single-use, HMAC only; regenerate with a current code. Lost device: step up with a recovery code, then "Đổi sang thiết bị mới".
- 5 code attempts per admin per 15 min (reserved before comparing); per-user admin API limits 240 req/min and 30 writes/min.

### Local TOTP flow
```bash
cd apps/api
node --env-file=../../.env scripts/seed-platform-admin.mjs --email admin@gugu.local --with-totp
# prints the base32 secret once; add it to an authenticator app, or:
node scripts/totp-code.mjs <secret>          # current 6-digit code (each works once)
node scripts/totp-code.mjs <secret> --next   # next step, for a second action within 30 s
```
Without `--with-totp`, sign in at `/vi/sign-in` (Mailpit), open `/vi/admin/security` within 15 minutes and enrol in the panel (setup key + `otpauth://` link; recovery codes shown once).

## File map

- `packages/domain/src/auth/permissions.ts`: roles, permissions, overrides.
- `packages/domain/src/phone/vn-phone.ts`: VN phone → E.164.
- `packages/contracts/src/auth/auth.ts`, `packages/contracts/src/salon/{registration,salon}.ts`: Zod contracts.
- `apps/api/src/common/guards/{auth-policy,principal}.ts`: decorators, `Principal`, `SalonContext`, `@CurrentUser/@CurrentSalon`.
- `apps/api/src/modules/auth/`: magic link, sessions, sign-in, social verifier, `/auth/*` and `/me`.
- `apps/api/src/modules/authorization/`: `AuthGuard` (global), `MembershipService`, route inventory + boot check.
- `apps/api/src/modules/audit/`: `AuditService`.
- `apps/api/src/modules/auth/mfa/`: `totp.ts` (RFC 6238, recovery codes), `admin-mfa.service.ts`; `http/admin-mfa.controller.ts`; `common/crypto/sealed-box.ts`.
- `apps/api/src/modules/privacy/`: `application/{client-data,client-privacy.service,salon-export.service,retention.service}.ts`, `domain/render-export.ts`, `http/privacy.controller.ts`; worker `apps/api/src/jobs/privacy.processor.ts`.
- `apps/api/scripts/{seed-platform-admin,totp-code}.mjs`: local admin + TOTP.
- `apps/app/features/admin/{SecurityScreen,StepUpPrompt,MfaBanner}.tsx`; `apps/app/features/salon-crm/pages/customers/ClientPrivacySection.tsx`, `pages/settings/PrivacySection.tsx`, `data/privacy.ts`; `apps/app/services/files/share.ts`; strings in `privacy` and `admin` namespaces.
- `apps/api/src/modules/salons/`: registration, reference data, salon read models.
- `apps/api/src/infrastructure/{mail,rate-limit}/`: SMTP transport, Valkey fixed-window limiter.
- `apps/app/services/auth/`: `apiFetch`, `AuthProvider`, token stores (`token-store.native.ts` = SecureStore; web keeps only the CSRF token in memory).
- `apps/app/features/auth/`, `apps/app/features/salon-join/`: sign-in, verify and join screens.
- Tests: `apps/api/src/modules/auth/admin-mfa.int.test.ts`, `auth/mfa/totp.test.ts`, `privacy/privacy.int.test.ts`, `privacy/domain/render-export.test.ts`, `authorization/admin-rate-limit.int.test.ts`, `jobs/worker-module.int.test.ts`, `apps/api/src/modules/{auth,salons}/*.int.test.ts` (stack), `apps/api/src/modules/authorization/authorization.e2e.test.ts`, `apps/api/test/{auth-fakes,mailpit,rate-limits}.ts`, `apps/api/test/factories/identity.ts`.

## ADRs

Written: ADR-0011 (admin TOTP step-up), ADR-0012 (salon privacy tools). To write: the session model (opaque tokens instead of JWT; cookie on web, SecureStore on native), the RLS strategy (milestone 6) and the verification channels (email/Zalo now, SMS later).
