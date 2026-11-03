import { SetMetadata } from "@nestjs/common";
import type { PlatformPermission, SalonPermission } from "@gugu/domain";

/**
 * Every route MUST declare exactly one auth policy (default deny, spec 05 R15). The boot check in
 * modules/authorization refuses to start the app when a route has none.
 */
export const AUTH_POLICY = "gugu:auth-policy";

export type AuthPolicy =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "salon"; permission: SalonPermission }
  | { kind: "platform"; permission: PlatformPermission };

/** No sign-in needed. A valid session is still resolved when present (e.g. registration). */
export const Public = () => SetMetadata(AUTH_POLICY, { kind: "public" } satisfies AuthPolicy);

/** Any signed-in user (customer or salon member). */
export const Authenticated = () =>
  SetMetadata(AUTH_POLICY, { kind: "authenticated" } satisfies AuthPolicy);

/**
 * Salon-scoped route: the path MUST contain `:salonId`. The guard resolves the caller's membership
 * (404 when none — never reveal other tenants) and checks the permission (403 when missing).
 */
export const RequirePermission = (permission: SalonPermission) =>
  SetMetadata(AUTH_POLICY, { kind: "salon", permission } satisfies AuthPolicy);

export const RequirePlatformPermission = (permission: PlatformPermission) =>
  SetMetadata(AUTH_POLICY, { kind: "platform", permission } satisfies AuthPolicy);

/**
 * Suspension exception (owner answer q92, ADR-0012): while GuGu has suspended a salon, every
 * salon write is refused with 403 `salon.suspended` — except the routes listed here, so the owner
 * can still answer clients' privacy requests. Exactly these (method, path, permission) triples may
 * carry `@AllowWhileSuspended()`; the boot check refuses to start when a route carries it without
 * being listed, or when a listed route is missing or has a different permission. Not a bypass of
 * anything else: membership, permission, CSRF and audit all apply as usual.
 */
export const SUSPENSION_WRITE_ALLOWLIST = [
  {
    method: "POST",
    path: "salons/:salonId/customers/:customerId/erase",
    permission: "customers.erase",
  },
  { method: "POST", path: "salons/:salonId/privacy/exports", permission: "customers.export" },
] as const satisfies readonly { method: string; path: string; permission: SalonPermission }[];

/** Permissions a suspension-exempt route may require (the guard checks this too). */
export const SUSPENSION_EXEMPT_PERMISSIONS: ReadonlySet<SalonPermission> = new Set(
  SUSPENSION_WRITE_ALLOWLIST.map((r) => r.permission),
);

export const ALLOW_WHILE_SUSPENDED = "gugu:allow-while-suspended";

/** Marks one of the SUSPENSION_WRITE_ALLOWLIST routes; anywhere else the app does not boot. */
export const AllowWhileSuspended = () => SetMetadata(ALLOW_WHILE_SUSPENDED, true);
