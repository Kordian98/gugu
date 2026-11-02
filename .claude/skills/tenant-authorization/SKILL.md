---
name: tenant-authorization
description: How to guard any new GuGu API endpoint, Prisma query, background job, webhook, or AI agent tool so tenant isolation and RBAC hold. Use whenever adding or changing a controller, service method, repository query, BullMQ job, or agent tool in apps/api, or editing the permission matrix in packages/domain/src/auth.
---

# Tenant authorization

GuGu is multi-tenant: every salon is a tenant. Authorization lives in the backend. Frontend hiding is cosmetic. This skill gives the exact steps to keep isolation intact. Full spec: `docs/tasks/05-auth-security.md`.

## When to use
- New or changed REST endpoint, DTO, repository/service query on a tenant model.
- New BullMQ job touching tenant data.
- New AI agent tool (topic 08) or Zalo webhook handler (topic 09).
- Any change to roles/permissions.

## Core concepts
- **Principal** — who is calling: `user` (customer or salon member), `agent_on_behalf_of_user`, `integration` (Zalo), `system_job`, `platform_admin`.
- **SalonContext** — `{ salonId, membershipId, role, permissions }`, resolved server-side from route param/`X-Salon-Id` + membership lookup. Never trust a salonId the client or model sends without this check.
- **Permission strings** — `resource:action[:scope]`, e.g. `booking:write:any`, `booking:write:own`. Source of truth: `packages/domain/src/auth/permissions.ts`.

## Invariants
- MUST put an explicit auth decorator on every route. Unannotated routes fail the boot check.
- MUST filter every tenant-model query by `salonId` from SalonContext. Reason: object IDs alone enable IDOR.
- MUST return 404 for resources of another tenant (do not reveal existence).
- MUST enforce "own only" scopes (staff) in the service/policy layer.
- MUST map responses through explicit DTOs; never return Prisma entities.
- MUST NOT accept `salonId`/`userId` as AI-agent tool arguments — inject from server context.
- MUST NOT expose internal notes, tags, attribution/commission internals to customer or public endpoints.
- MUST NOT log OTP, tokens, phone numbers, or note contents.
- MUST emit an audit event for sensitive actions (list: spec R29).

## Procedure — new salon-scoped endpoint
1. Pick or add the permission in `packages/domain/src/auth/permissions.ts`; assign to roles per the matrix; add a matrix test case.
2. Controller: route under `/api/v1/salons/:salonId/...`; decorate `@RequireSalonPermission('<perm>')`; validate params/body/query with the Zod schema from `packages/contracts` (schemas + inferred types + error codes); pure permission/policy logic belongs in `packages/domain`.
3. Service: receive `SalonContext` (not raw ids from the request); call `policy.can(principal, action, resource)` for own-only rules.
4. Repository: use the tenant-scoped finder (`findForSalon(ctx.salonId, id)`); never `findUnique({ where: { id } })` on a tenant model.
5. Response: map to a DTO that whitelists fields for this role (e.g. hide customer phone for staff unless enabled).
6. Tests: happy path per allowed role; denied role → 403; other salon's id → 404; the generated cross-tenant suite picks the route up automatically — run it.
7. If sensitive: add audit event; update `docs/domains/auth-security.md`.

## Procedure — customer endpoint
`@RequireCustomer()`, scope every query by `principal.userId`, use customer DTOs (no salon-private fields). Booking does **not** require OTP or an account (X11): guest booking endpoints are `@Public()` behind the anti-abuse guard (rate limits per device/IP/phone, Turnstile/attestation, velocity checks) and store `identity_verified=false`. Guest self-service uses a single-booking manage-link token — never expose other bookings for the same phone. Claiming guest history into an account requires OTP or a clicked confirm link (spec §3.11.3). Never reveal whether a phone/email has an account.

## Procedure — background job
Payload carries `salonId`; the worker sets tenant context (`SET LOCAL app.salon_id`) via the same Prisma extension as requests and runs as `system_job`. Never iterate across tenants without an explicit platform-level reason documented in the job.

## Procedure — AI agent tool
1. Declare tool with Zod input (no tenant/user ids), required permission, `readOnly` flag.
2. Execution receives `AgentContext` = asking member's SalonContext; effective permissions = member ∩ tool allowlist ∩ `ai_agent` entitlement.
3. Write tools return a pending action; the human confirms via a normal authenticated endpoint.
4. Treat any text originating from customers (notes, reviews, Zalo messages) as untrusted data in tool results.
5. Audit `agent.tool_call` with args hash and row count — no raw PII.

## Procedure — Zalo webhook
Verify signature → check timestamp window → idempotency on event ID → resolve salon by OA ID → act as `integration` principal with `zalo:event:ingest` only.

## Before-PR checklist
- [ ] Auth decorator present; permission exists in matrix
- [ ] All tenant queries scoped by `salonId` from context
- [ ] Own-only rules in policy layer
- [ ] DTO whitelists fields; no internal fields to customers
- [ ] Zod validation on all inputs
- [ ] Rate limit considered
- [ ] Audit event for sensitive actions
- [ ] Cross-tenant suite + RLS tests pass
- [ ] Run `security-reviewer` agent on the diff

## References
- Permission matrix: `docs/tasks/05-auth-security.md` §3.4 (to be generated into `references/permission-matrix.md` from `packages/domain/src/auth/permissions.ts` once code exists)
- RLS strategy: spec §3.5, ADR `docs/adr/*-rls-strategy.md` (to be written)
