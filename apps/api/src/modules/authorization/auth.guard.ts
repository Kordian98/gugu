import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { AUTH_ERRORS, uuidV7Schema } from "@gugu/contracts";
import { PLATFORM_ROLE_PERMISSIONS } from "@gugu/domain";
import { RequestContext } from "../../common/context/request-context";
import { AUTH_POLICY, type AuthPolicy } from "../../common/guards/auth-policy";
import type { AuthenticatedRequestState, Principal } from "../../common/guards/principal";
import { AppError } from "../../common/problem/app-error";
import { COMMON_ERRORS } from "../../common/problem/error-codes";
import { AppConfig } from "../../infrastructure/config/app-config";
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
      case "platform": {
        const user = this.requireUser(principal);
        const allowed = user.platformRole
          ? PLATFORM_ROLE_PERMISSIONS[user.platformRole].has(policy.permission)
          : false;
        if (!allowed) throw new AppError(403, COMMON_ERRORS.forbidden, "Permission required");
        return true;
      }
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
        return true;
      }
    }
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
