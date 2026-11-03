import { Injectable } from "@nestjs/common";
import type { DomainEvent, DomainEventHandler } from "../../../infrastructure/outbox/domain-events";
import { PlannerService } from "./planner.service";

/**
 * Outbox consumer (04-S5) of the notifications module. Delivery is at-least-once; the planner is
 * idempotent (deterministic delivery keys + job ids), so a redelivered event sends nothing twice.
 */
@Injectable()
export class NotificationEventsHandler implements DomainEventHandler {
  readonly name = "notifications.planner";
  readonly types = [
    "booking.created",
    "booking.status_changed",
    "booking.rescheduled",
    "zalo.handoff_requested",
    "notifications.settings_updated",
  ] as const;

  constructor(private readonly planner: PlannerService) {}

  async handle(event: DomainEvent): Promise<void> {
    await this.planner.handle(event);
  }
}
