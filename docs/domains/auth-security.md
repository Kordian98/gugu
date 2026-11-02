# Auth & security domain

Durable reference for identity, sessions, authorization, tenant isolation, audit and privacy in GuGu. Read this before changing anything in `apps/api/src/modules/{auth,authorization,audit,privacy,salons}`, `apps/api/src/common/guards`, `packages/domain/src/auth` or `apps/app/services/auth`. Requirements and rationale: `docs/tasks/05-auth-security.md`.

## Status

**Step 3 implemented** (spec milestones 1–5, X11/X12, q24/q71/q72): identity and tenancy schema, email magic link, web and native sessions, Apple/Google backend (disabled until configured), guards with the permission matrix, default-deny boot check, audit log, salon registration with trial (topic 12), generated cross-tenant suite. Web sign-in works end to end.

Not implemented yet: RLS policies (milestone 6), privacy jobs (consent, export, deletion; milestone 8), admin passkeys/TOTP and impersonation (milestone 9), agent principal (milestone 10), Zalo Login (hidden, q28), staff invitations API, session list UI, client-side Apple/Google SDKs. Native sign-in was type-checked only; it has not been run on an iOS/Android dev build.

## Summary

- **Sign-in:** email magic link (link + 6-digit code), Apple and Google ID tokens. Zalo Login is hidden until the central OA exists. No SMS or SMS OTP for now (X12).
- **Booking needs no OTP (X11):** guests book with name + phone, flagged `identity_verified=false`. Abuse is handled by the anti-abuse layer, the salon confirmation policy and an optional confirm link (email now, Zalo later). Not built yet (booking engine, topic 06).
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
| `user_profiles`, `customers` | Profile, customer-only data | Created on first sign-in or registration |
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
| `POST /api/v1/auth/magic-link` | public | Always 202 `{status:"sent"}`. Limits: 3/15 min and 10/day per email (hashed), 30/15 min per IP prefix |
| `POST /api/v1/auth/magic-link/verify` | public | `{token}` or `{email, code}` + `client`. Web sets the cookie and returns `csrfToken`. Native returns tokens |
| `POST /api/v1/auth/social` | public | Apple/Google ID token. 404 `auth.provider_disabled` when not configured |
| `POST /api/v1/auth/refresh` | public | Native refresh rotation |
| `POST /api/v1/auth/sign-out`, `/sign-out-all` | authenticated | Revokes the session(s) and clears the cookie |
| `GET /api/v1/me` | authenticated | User, memberships, web `csrfToken` |
| `GET /api/v1/public/categories`, `/public/locations` | public | Reference data for registration |
| `POST /api/v1/salons/registrations` | public | Signed in → owner at once. Anonymous → `email` required, memberships `pending_verification` until the emailed link is opened. Starts the 14-day trial in the same transaction |
| `GET/PATCH /api/v1/salons/:salonId`, `GET …/members` | `salon.read` / `salon.profile.write` / `members.read` | Minimal workspace read models |
| `GET /api/v1/salons/:salonId/entitlements` | `subscription.read` | Topic 12, guarded by the membership guard |

Errors: `AUTH_ERRORS` (`packages/contracts/src/auth/auth.ts`) and `SALON_ERRORS` (`packages/contracts/src/salon/registration.ts`).

## Flows

- **Magic link (web):** request → SMTP email (Mailpit locally; vi/en, `email` namespace) → `/{locale}/auth/verify?token=…` → `POST verify` → cookie + `csrfToken` → redirect to `redirectPath` or `/{locale}/me`. On reload, `GET /me` returns the CSRF token again; it is kept in memory only.
- **Magic link (native):** request with `client: "native"` → the user types the 6-digit code → tokens go to SecureStore. Universal links for the emailed URL come with topic 13.
- **Refresh:** `apiFetch` refreshes once on 401, with one in-flight refresh shared by concurrent calls.
- **Salon registration (anonymous):** a user row is created unverified → org, salon, memberships and trial are created in one transaction → after commit, a `salon_registration` magic link is emailed → verifying it activates the owner memberships (audit `salon.owner_verified`).
- Staff invitation, agent tool authorization, Zalo webhook ingest, account deletion/export: _TBD_ (later milestones).

## Enable Apple / Google

1. Create the OAuth clients (Google: Web + iOS + Android client IDs; Apple: Services ID for web, bundle ID for iOS).
2. Set `GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS` (comma-separated) in `.env`. `GET /auth/providers` then reports them enabled and the sign-in screen shows the buttons.
3. **Still TODO:** wire the client SDKs (Google Identity Services / `expo-auth-session` or native Google Sign-In, `expo-apple-authentication`) so the buttons obtain an ID token and call `POST /auth/social`. The backend verifies signature (JWKS), issuer, audience and expiry, and links to an existing account only when the provider has verified the email (R5).

## Permission matrix

The source of truth is `packages/domain/src/auth/permissions.ts`, tested in `permissions.test.ts`. Permission strings use the form `resource.action[.own]`. Staff see customer phone numbers by default (q24). Owner-only permissions (`salon.delete`, `members.roles.write`, `customers.export`, `integrations.zalo.manage`, `billing.manage`) can't be granted through overrides.

## Audit events

`AUDIT_ACTIONS` in `apps/api/src/modules/audit/audit.service.ts`: `auth.sign_in`, `auth.sign_out`, `auth.sign_out_all`, `auth.session_reuse_detected`, `auth.identity_linked`, `salon.registered`, `salon.owner_verified`, `salon.profile_updated`. Metadata never holds secrets or personal data.

## Data inventory

| Field | Table | Purpose | Retention | Visible to |
|---|---|---|---|---|
| email | users, magic_link_tokens, auth_identities | Sign-in, contact | Until account deletion (+30-day grace) | User; GuGu support |
| phone_e164 | users, salons | Contact (unverified) | Same | Salon team (q24) |
| ip_prefix (/24, /48), user_agent | sessions, magic_link_tokens, audit_logs | Security | Sessions: until expiry; audit: TBD (legal) | Platform admins; salon owner (own audit) |
| token/code HMACs | sessions, refresh_tokens, magic_link_tokens | Authentication | Until expiry/revocation (cleanup job TODO) | Nobody |

## File map

- `packages/domain/src/auth/permissions.ts`: roles, permissions, overrides.
- `packages/domain/src/phone/vn-phone.ts`: VN phone → E.164.
- `packages/contracts/src/auth/auth.ts`, `packages/contracts/src/salon/{registration,salon}.ts`: Zod contracts.
- `apps/api/src/common/guards/{auth-policy,principal}.ts`: decorators, `Principal`, `SalonContext`, `@CurrentUser/@CurrentSalon`.
- `apps/api/src/modules/auth/`: magic link, sessions, sign-in, social verifier, `/auth/*` and `/me`.
- `apps/api/src/modules/authorization/`: `AuthGuard` (global), `MembershipService`, route inventory + boot check.
- `apps/api/src/modules/audit/`: `AuditService`.
- `apps/api/src/modules/salons/`: registration, reference data, salon read models.
- `apps/api/src/infrastructure/{mail,rate-limit}/`: SMTP transport, Valkey fixed-window limiter.
- `apps/app/services/auth/`: `apiFetch`, `AuthProvider`, token stores (`token-store.native.ts` = SecureStore; web keeps only the CSRF token in memory).
- `apps/app/features/auth/`, `apps/app/features/salon-join/`: sign-in, verify and join screens.
- Tests: `apps/api/src/modules/{auth,salons}/*.int.test.ts` (stack), `apps/api/src/modules/authorization/authorization.e2e.test.ts`, `apps/api/test/{auth-fakes,mailpit,rate-limits}.ts`, `apps/api/test/factories/identity.ts`.

## ADRs

To write: the session model (opaque tokens instead of JWT; cookie on web, SecureStore on native), the RLS strategy (milestone 6) and the verification channels (email/Zalo now, SMS later).
