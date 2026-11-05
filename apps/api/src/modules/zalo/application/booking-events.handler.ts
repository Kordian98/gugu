import { Injectable } from "@nestjs/common";
import type { DomainEvent, DomainEventHandler } from "../../../infrastructure/outbox/domain-events";
import { BookingUpdatesService } from "./booking-updates.service";

/**
 * Outbox consumer (04-S5): tells the Zalo customer about salon-side booking changes right after
 * the commit instead of on the minute scan. Reschedules dedupe by booking revision; other sends
 * dedupe by `booking_update:<eventId>`.
 */
@Injectable()
export class ZaloBookingEventsHandler implements DomainEventHandler {
  readonly name = "zalo.booking_updates";
  readonly types = ["booking.created", "booking.status_changed", "booking.rescheduled"] as const;

  constructor(private readonly updates: BookingUpdatesService) {}

  async handle(event: DomainEvent): Promise<void> {
    await this.updates.handle(event.id, event.type, event.payload);
  }
}
