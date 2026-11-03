// Public surface of the subscriptions module for other modules (boundary rule
// api-modules-use-facades). Added by topic 05 so salon registration can start the trial.
export { SubscriptionsFacade } from "./application/subscriptions.facade";
export { EntitlementService } from "./application/entitlement.service";
export {
  type AdminChange,
  type Snapshot,
  SubscriptionAdminService,
} from "./application/subscription-admin.service";
export { Clock } from "./application/clock";
export { effectiveStatus } from "./domain/subscription-status";
export { RequiresEntitlement } from "./http/requires-entitlement";
export { SubscriptionsModule } from "./subscriptions.module";
