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
