import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { PlatformRole, SalonPermission, SalonRole } from "@gugu/domain";
import { AppError } from "../problem/app-error";
import { COMMON_ERRORS } from "../problem/error-codes";

/** Who is calling (spec 05 R14). Agent/integration/system principals join in steps 8–9. */
export type Principal =
  | { kind: "anonymous" }
  | {
      kind: "user";
      userId: string;
      sessionId: string;
      sessionKind: "web" | "native";
      platformRole: PlatformRole | null;
    };

export type UserPrincipal = Extract<Principal, { kind: "user" }>;

/** Resolved by the guard for routes with `@RequirePermission` (never from client input). */
export interface SalonContext {
  salonId: string;
  organizationId: string;
  role: SalonRole;
  permissions: ReadonlySet<SalonPermission>;
}

export interface AuthenticatedRequestState {
  principal?: Principal;
  salonContext?: SalonContext;
}

const state = (ctx: ExecutionContext): AuthenticatedRequestState =>
  ctx.switchToHttp().getRequest<AuthenticatedRequestState>();

/** The caller; anonymous on public routes without a session. */
export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => state(ctx).principal ?? { kind: "anonymous" },
);

/** The signed-in user; only valid on `@Authenticated` / `@RequirePermission` routes. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const principal = state(ctx).principal;
  if (principal?.kind !== "user") {
    throw new AppError(401, COMMON_ERRORS.unauthorized, "Sign-in required");
  }
  return principal;
});

/** Tenant context of a `@RequirePermission` route. */
export const CurrentSalon = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const salon = state(ctx).salonContext;
  if (!salon) throw new Error("CurrentSalon used on a route without @RequirePermission");
  return salon;
});
