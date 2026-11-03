import { Injectable } from "@nestjs/common";
import { ReconcileService } from "./reconcile.service";
import { SenderService } from "./sender.service";

/** Entry points for the `notify` BullMQ queue (jobs/notify.processor.ts). */
@Injectable()
export class NotifyJobs {
  constructor(
    private readonly sender: SenderService,
    private readonly reconciler: ReconcileService,
  ) {}

  send(deliveryId: string, finalAttempt: boolean) {
    return this.sender.send(deliveryId, finalAttempt);
  }

  reconcile() {
    return this.reconciler.reconcile();
  }
}
