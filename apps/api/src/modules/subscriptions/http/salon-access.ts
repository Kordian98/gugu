import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { AppError } from "../../../common/problem/app-error";

/**
 * Who may read a salon's subscription data. Placeholder port until topic 05 lands the membership
 * guard + `@RequirePermission('subscription.read')`; then this guard is replaced by those.
 * The default denies everyone (fail closed) — tests and topic 05 provide a real implementation.
 */
export interface SalonAccess {
  assertCanRead(request: Request, salonId: string): Promise<void>;
}

export const SALON_ACCESS = Symbol("SALON_ACCESS");

@Injectable()
export class DenyAllSalonAccess implements SalonAccess {
  assertCanRead(): Promise<void> {
    return Promise.reject(new AppError(401, COMMON_ERRORS.unauthorized, "Authentication required"));
  }
}

@Injectable()
export class SalonReadAccessGuard implements CanActivate {
  constructor(@Inject(SALON_ACCESS) private readonly access: SalonAccess) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const salonId = request.params["salonId"];
    if (typeof salonId !== "string") return false;
    await this.access.assertCanRead(request, salonId);
    return true;
  }
}
