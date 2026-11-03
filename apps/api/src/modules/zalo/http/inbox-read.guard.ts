import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UseGuards,
} from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { problemSchema } from "@gugu/contracts";
import type { AuthenticatedRequestState } from "../../../common/guards/principal";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";

/**
 * Reading the Zalo inbox: needs the `zalo.inbox` entitlement — except while GuGu has suspended the
 * salon (q89, ADR-0010). A suspended salon is granted nothing, but its members keep read access to
 * their own data, so the inbox stays readable. Use only on GET routes: every write of a suspended
 * salon is refused by the auth guard (`salon.suspended`). Runs after the global auth guard, which
 * resolved the SalonContext from the route's `:salonId` and the caller's membership.
 */
@Injectable()
export class ZaloInboxReadGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const salon = context.switchToHttp().getRequest<AuthenticatedRequestState>().salonContext;
    // Fail closed: these routes always carry @RequirePermission, so a context must exist.
    if (!salon) throw new Error("ZaloInboxReadGuard used on a route without a salon context");
    if (salon.suspended) return true;
    await this.entitlements.assert(salon.salonId, "zalo.inbox");
    return true;
  }
}

/** `@RequiresEntitlement("zalo.inbox")` for inbox reads that stay open while suspended. */
export function RequiresInboxRead(): MethodDecorator {
  return applyDecorators(
    UseGuards(ZaloInboxReadGuard),
    ApiResponse({
      status: 403,
      description: "Plan does not include `zalo.inbox` (code `entitlement.required`).",
      standardSchema: problemSchema,
    }),
  );
}
