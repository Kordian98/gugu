import { Global, Module } from "@nestjs/common";
import { Clock } from "./application/clock";
import { ENTITLEMENT_CACHE } from "./application/entitlement-cache";
import { EntitlementService } from "./application/entitlement.service";
import { SubscriptionAdminService } from "./application/subscription-admin.service";
import { SubscriptionsFacade } from "./application/subscriptions.facade";
import { EntitlementsController } from "./http/entitlements.controller";
import { EntitlementGuard } from "./http/requires-entitlement";
import { RedisEntitlementCache } from "./infra/redis-entitlement-cache";

/**
 * Plans, subscriptions and entitlements (topic 12, docs/domains/monetization-admin.md).
 * Other modules use only the exports: EntitlementService (checks) and SubscriptionsFacade
 * (startTrial for salon registration). Routes use `@RequiresEntitlement(key)`.
 * Global so any module's routes can use the guard without importing this module.
 */
@Global()
@Module({
  controllers: [EntitlementsController],
  providers: [
    Clock,
    EntitlementService,
    SubscriptionsFacade,
    SubscriptionAdminService,
    EntitlementGuard,
    { provide: ENTITLEMENT_CACHE, useClass: RedisEntitlementCache },
  ],
  exports: [EntitlementService, SubscriptionsFacade, SubscriptionAdminService, EntitlementGuard, Clock],
})
export class SubscriptionsModule {}
