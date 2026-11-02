import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiResponse } from "@nestjs/swagger";
import type { Request } from "express";
import { type BooleanEntitlementKey, problemSchema, uuidV7Schema } from "@gugu/contracts";
import { RequestContext } from "../../../common/context/request-context";
import { EntitlementService } from "../application/entitlement.service";

const ENTITLEMENT_KEY = Symbol("requiredEntitlement");

/**
 * Gates a route by a boolean entitlement of the tenant salon (skill `entitlements`).
 * Must run after authentication + membership guards (topic 05). The salon comes from the request
 * context set by the membership guard, falling back to the `:salonId` route param — never the body.
 */
export function RequiresEntitlement(key: BooleanEntitlementKey): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(ENTITLEMENT_KEY, key),
    UseGuards(EntitlementGuard),
    ApiResponse({
      status: 403,
      description: `Plan does not include \`${key}\` (code \`entitlement.required\`).`,
      standardSchema: problemSchema,
    }),
  );
}

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<BooleanEntitlementKey | undefined>(
      ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!key) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const salonId = RequestContext.current()?.salonId ?? request.params["salonId"];
    if (!uuidV7Schema.safeParse(salonId).success) {
      // A gated route without a tenant is a programming error: fail closed.
      throw new Error(`@RequiresEntitlement('${key}') used on a route without a salon`);
    }
    await this.entitlements.assert(salonId as string, key);
    return true;
  }
}
