import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { AUTH_ERRORS, SALON_SUSPENDED_ERROR, uuidV7Schema } from "@gugu/contracts";
import {
  PLATFORM_ROLE_PERMISSIONS,
  type PlatformPermission,
  type SalonPermission,
} from "@gugu/domain";
import { RequestContext } from "../../common/context/request-context";
import {
  ALLOW_WHILE_SUSPENDED,
  AUTH_POLICY,
  type AuthPolicy,
  SUSPENSION_EXEMPT_PERMISSIONS,
} from "../../common/guards/auth-policy";
import type { AuthenticatedRequestState, Principal } from "../../common/guards/principal";
import { AppError } from "../../common/problem/app-error";
import { COMMON_ERRORS } from "../../common/problem/error-codes";
import { AppConfig } from "../../infrastructure/config/app-config";
import {
  type RateLimitRule,
  RateLimitService,
} from "../../infrastructure/rate-limit/rate-limit.service";
import {
  CSRF_HEADER,
  parseCookies,
  safeEqual,
  SessionService,
  sessionCookieName,
  setSessionCookie,
} from "../auth/auth.facade";
import { MembershipService } from "./membership.service";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Per-user limits on the platform admin API (`/api/v1/admin/*`, every `@RequirePlatformPermission`
 * route). Generous for a person clicking through the panel (defaults 240 requests and 30 writes per
 * minute, env ADMIN_RATE_LIMIT_PER_MINUTE / ADMIN_WRITE_RATE_LIMIT_PER_MINUTE), tight enough to
 * stop a scripted stolen session from bulk-reading the directory or hammering writes.
 */
export function adminRateLimits(env: {
  ADMIN_RATE_LIMIT_PER_MINUTE: number;
  ADMIN_WRITE_RATE_LIMIT_PER_MINUTE: number;
}): { all: RateLimitRule; writes: RateLimitRule } {
  return {
    all: { name: "admin.requests.user", limit: env.ADMIN_RATE_LIMIT_PER_MINUTE, windowSeconds: 60 },
    writes: {
      name: "admin.writes.user",
      limit: env.ADMIN_WRITE_RATE_LIMIT_PER_MINUTE,
      windowSeconds: 60,
    },
  };
}

/**
 * Suspended by GuGu (topic 12 M12.6): members keep read access, every write is refused — except
 * the narrow q92 allow-list (client erasure, salon-wide export start). A route is exempt only if it
 * carries `@AllowWhileSuspended()` AND requires one of SUSPENSION_EXEMPT_PERMISSIONS; the boot check
 * pins the decorator to the exact routes in SUSPENSION_WRITE_ALLOWLIST.
 */
export function assertWritable(
  salon: { suspended?: boolean },
  method: string,
  exempt: { allowWhileSuspended: boolean; permission: SalonPermission },
): void {
  if (!salon.suspended || SAFE_METHODS.has(method)) return;
  if (exempt.allowWhileSuspended && SUSPENSION_EXEMPT_PERMISSIONS.has(exempt.permission)) return;
  throw new AppError(403, SALON_SUSPENDED_ERROR, "Salon is suspended");
}

/**
 * Global guard (spec 05 §3.3): authenticates the session (web cookie or native bearer), enforces
 * CSRF for cookie-authenticated writes, then applies the route's auth policy. Salon routes get a
 * server-resolved SalonContext; a salon the caller doesn't belong to is a 404, a missing
 * permission a 403. Sets RequestContext.actor and RequestContext.salonId for downstream code.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
    private readonly sessions: SessionService,
    private readonly memberships: MembershipService,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const policy = this.reflector.getAllAndOverride<AuthPolicy | undefined>(AUTH_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // The boot check guarantees a policy; fail closed if one slips through anyway.
    if (!policy) throw new AppError(403, COMMON_ERRORS.forbidden, "Route has no auth policy");

    const http = context.switchToHttp();
    const req = http.getRequest<Request & AuthenticatedRequestState>();
    const res = http.getResponse<Response>();
    const principal = await this.authenticate(req, res);
    req.principal = principal;
    const ctx = RequestContext.current();
    if (ctx && principal.kind === "user") ctx.actor = { type: "user", id: principal.userId };

    switch (policy.kind) {
      case "public":
        return true;
      case "authenticated":
        this.requireUser(principal);
        return true;
      case "platform":
        await this.authorizePlatform(principal, policy.permission, req.method);
        return true;
      case "salon": {
        const user = this.requireUser(principal);
        const salonId = req.params["salonId"];
        const notFound = () => new AppError(404, COMMON_ERRORS.notFound, "Not found");
        if (!uuidV7Schema.safeParse(salonId).success) throw notFound();
        const salon = await this.memberships.resolve(user.userId, salonId as string);
        if (!salon) throw notFound();
        req.salonContext = salon;
        if (ctx) ctx.salonId = salon.salonId;
        if (!salon.permissions.has(policy.permission)) {
          throw new AppError(403, COMMON_ERRORS.forbidden, "Permission required");
        }
        const allowWhileSuspended =
          this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_SUSPENDED, [
            context.getHandler(),
            context.getClass(),
          ]) === true;
        assertWritable(salon, req.method, {
          allowWhileSuspended,
          permission: policy.permission,
        });
        return true;
      }
    }
  }

  /** Platform role grants the permission (salon roles never do), then per-user admin rate limits. */
  private async authorizePlatform(
    principal: Principal,
    permission: PlatformPermission,
    method: string,
  ): Promise<void> {
    const user = this.requireUser(principal);
    const allowed = user.platformRole
      ? PLATFORM_ROLE_PERMISSIONS[user.platformRole].has(permission)
      : false;
    if (!allowed) throw new AppError(403, COMMON_ERRORS.forbidden, "Permission required");
    const rules = adminRateLimits(this.config.env);
    await this.limits.consume(rules.all, user.userId);
    if (!SAFE_METHODS.has(method)) await this.limits.consume(rules.writes, user.userId);
  }

  private requireUser(principal: Principal) {
    if (principal.kind !== "user") {
      throw new AppError(401, AUTH_ERRORS.unauthenticated, "Sign-in required");
    }
    return principal;
  }

  private async authenticate(req: Request, res: Response): Promise<Principal> {
    const authorization = req.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const result = await this.sessions.authenticate("native", authorization.slice(7).trim());
      // An invalid bearer token is an error, not anonymous access (clients must refresh).
      if (!result) throw new AppError(401, AUTH_ERRORS.unauthenticated, "Access token invalid");
      return result.principal;
    }
    const production = this.config.isProduction;
    const cookie = parseCookies(req.headers.cookie)[sessionCookieName(production)];
    if (!cookie) return { kind: "anonymous" };
    const result = await this.sessions.authenticate("web", cookie);
    if (!result) return { kind: "anonymous" };
    if (!SAFE_METHODS.has(req.method)) {
      const header = req.headers[CSRF_HEADER];
      const expected = this.sessions.csrfToken(result.principal.sessionId);
      if (typeof header !== "string" || !safeEqual(header, expected)) {
        throw new AppError(403, AUTH_ERRORS.csrfFailed, "CSRF token missing or invalid");
      }
    }
    if (result.refreshedCookie) setSessionCookie(res, production, cookie);
    return result.principal;
  }
}
