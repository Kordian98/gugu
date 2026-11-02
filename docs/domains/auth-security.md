# Auth & security domain

Durable reference for identity, sessions, authorization, tenant isolation, audit, and privacy in GuGu. Read this before changing anything in `apps/api/src/modules/{auth,authorization,audit,privacy}` or `packages/domain/src/auth`. Requirements and rationale: `docs/tasks/05-auth-security.md`.

> Status: skeleton — sections marked _TBD_ are filled as code lands.

## Summary
- Sign-in: email magic link, Apple, Google. Zalo Login built but hidden until the central OA exists. No SMS / SMS OTP for now (X12); `sms` channel is a mock.
- Booking needs no OTP (X11): guests book with name + phone, flagged `identity_verified=false`; anti-abuse layer + salon confirmation policy + optional confirm link (email now, Zalo later).
- Environments: localhost only for now (X16); target hosting AWS ap-southeast-1 later. Accounts held by the owner's Polish company. Legal review postponed (q04), required before public launch.
- Sessions: web = httpOnly `__Host-` cookie + CSRF; native = 15-min access JWT + rotating refresh token in SecureStore.
- Authorization: Principal + SalonContext + permission strings; default deny; tenant-scoped repositories; RLS as defense in depth.
- Non-human principals: AI agent on behalf of a member, Zalo integration, system jobs.
- Privacy: designed against Law 91/2025/QH15 + Decree 356/2025/ND-CP concepts; pending legal review — no compliance claim.

## Invariants
See `.claude/skills/tenant-authorization/SKILL.md#invariants` (canonical list).

## Model
_TBD: User, Session, VerificationChallenge, SalonMember, MembershipPermissionOverride, Consent, AuditLog, IntegrationCredential — link to `docs/database.md`._

## Flows
- Magic-link sign-in & confirm-link verification — _TBD sequence diagram_
- Refresh rotation & reuse detection — _TBD_
- Staff invitation — _TBD_
- Agent tool call authorization — _TBD_
- Zalo webhook ingest — _TBD_
- Account deletion & export — _TBD_

## Permission matrix
Source of truth: `packages/domain/src/auth/permissions.ts` (_TBD_). Request/response schemas: `packages/contracts/src/auth`. Initial matrix: task spec §3.4.

## Data inventory
| Field | Table | Purpose | Basis / consent | Retention | Visible to |
|---|---|---|---|---|---|
| _TBD_ | | | | | |

## Audit events
_TBD: enumerated list with payload shape (spec R29)._

## File map
_TBD_

## ADRs
- _TBD_ session model · RLS strategy · verification channels (email/Zalo now, SMS later)
