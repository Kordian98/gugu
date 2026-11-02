// Public surface of the bookings module (boundary rule api-modules-use-facades).
export { BookingsEngineModule, BookingsModule, BookingsWorkerModule } from "./bookings.module";
export { BookingMaintenance } from "./application/booking-maintenance";
// Engine API for other modules (topic 09 Zalo bot): availability, create, transitions, reschedule.
export { BookingClock } from "./application/booking-clock";
export { BookingContexts } from "./http/booking-contexts";
export { BookingQueries } from "./application/booking.queries";
export { BookingLifecycleCommands } from "./application/booking-lifecycle.commands";
export {
  CreateBookingCommand,
  type CreateBookingRequest,
} from "./application/create-booking.command";
export type { BookingActor } from "./application/booking-actor";
export type { IdempotencyClaim } from "./infra/idempotency";
export type { SalonBookingContext } from "./infra/booking-inputs";
// Resource requirements saved with a service by the catalog editor (topic 07, M6.6).
export { replaceServiceResourceRequirements } from "./infra/resource-requirements";
// Account-deletion hook for the privacy job (topic 05, q71).
export { ANONYMISED_CUSTOMER_NAME, BookingAnonymiser } from "./application/booking-anonymiser";
