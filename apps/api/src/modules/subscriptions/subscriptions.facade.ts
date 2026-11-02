// Public surface of the subscriptions module for other modules (boundary rule
// api-modules-use-facades). Added by topic 05 so salon registration can start the trial.
export { SubscriptionsFacade } from "./application/subscriptions.facade";
export { EntitlementService } from "./application/entitlement.service";
export { RequiresEntitlement } from "./http/requires-entitlement";
