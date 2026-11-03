import { Injectable } from "@nestjs/common";
import { RemindersService } from "./reminders.service";
import { SenderService } from "./sender.service";

/** Entry points for the `notify` BullMQ queue (jobs/notify.processor.ts). */
@Injectable()
export class NotifyJobs {
  constructor(
    private readonly sender: SenderService,
    private readonly reminders: RemindersService,
  ) {}

  send(deliveryId: string, finalAttempt: boolean) {
    return this.sender.send(deliveryId, finalAttempt);
  }

  reconcile() {
    return this.reminders.reconcile();
  }
}
