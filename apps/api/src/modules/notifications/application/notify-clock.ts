import { Injectable } from "@nestjs/common";

/** Time source for the notifications module (plans, reminders, Zalo grace). Overridden in tests. */
@Injectable()
export class NotifyClock {
  now(): Date {
    return new Date();
  }
}
