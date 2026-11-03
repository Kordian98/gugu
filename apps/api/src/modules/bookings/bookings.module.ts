import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.facade";
import { AuthModule } from "../auth/auth.facade";
import { BookingActors } from "./application/booking-actor";
import { BookingAnonymiser } from "./application/booking-anonymiser";
import { BookingClock } from "./application/booking-clock";
import { BookingFeatures } from "./application/booking-chain";
import { BookingLifecycleCommands } from "./application/booking-lifecycle.commands";
import { BookingMaintenance } from "./application/booking-maintenance";
import { BookingQueries } from "./application/booking.queries";
import { CreateBookingCommand } from "./application/create-booking.command";
import { HoldsCommand } from "./application/holds.command";
import { BookingContexts } from "./http/booking-contexts";
import { ResourcesController } from "./http/resources.controller";
import { SalonBookingsController } from "./http/salon-bookings.controller";
import { ResourcesService } from "./application/resources.service";
import { AvailabilityCache } from "./infra/availability-cache";
import { BookingSecrets } from "./infra/booking-secrets";

/**
 * Booking engine (topic 06): availability, holds, booking creation, state machine, reschedule.
 * Pure rules live in packages/domain/src/booking; this module loads inputs, runs the write
 * transaction and owns booking_occupancy. Spec: docs/tasks/06-booking-engine.md.
 */
@Module({
  imports: [AuditModule, AuthModule],
  // PublicBookingController (salon booking page, guest manage links) is deliberately NOT routed:
  // roadmap X23 — no customer-facing booking surface on gugu.vn until a Vietnamese legal review.
  // Its domain paths (customer actor, holds, draft policy, per-phone limit) stay tested.
  controllers: [SalonBookingsController, ResourcesController],
  providers: [
    AvailabilityCache,
    BookingActors,
    BookingAnonymiser,
    BookingClock,
    BookingContexts,
    BookingFeatures,
    BookingLifecycleCommands,
    BookingMaintenance,
    BookingQueries,
    BookingSecrets,
    CreateBookingCommand,
    HoldsCommand,
    ResourcesService,
  ],
  exports: [
    BookingMaintenance,
    // For tests that mount the unrouted PublicBookingController (X23).
    BookingContexts,
    BookingFeatures,
    BookingQueries,
    BookingSecrets,
    CreateBookingCommand,
    BookingLifecycleCommands,
    HoldsCommand,
  ],
})
export class BookingsModule {}

/** Worker-side slice: just what the maintenance sweep needs (no controllers). */
@Module({
  imports: [AuditModule],
  providers: [
    AvailabilityCache,
    BookingClock,
    BookingLifecycleCommands,
    BookingMaintenance,
    BookingSecrets,
  ],
  exports: [BookingMaintenance],
})
export class BookingsWorkerModule {}

/**
 * Engine commands and queries without HTTP, for other modules through the facade (topic 09: the
 * Zalo booking bot books, cancels and reschedules as the customer). Same providers, no controllers.
 */
@Module({
  imports: [AuditModule],
  providers: [
    BookingAnonymiser,
    AvailabilityCache,
    BookingClock,
    BookingContexts,
    BookingFeatures,
    BookingLifecycleCommands,
    BookingQueries,
    BookingSecrets,
    CreateBookingCommand,
  ],
  exports: [
    BookingAnonymiser,
    BookingContexts,
    BookingFeatures,
    BookingLifecycleCommands,
    BookingQueries,
    CreateBookingCommand,
  ],
})
export class BookingsEngineModule {}
