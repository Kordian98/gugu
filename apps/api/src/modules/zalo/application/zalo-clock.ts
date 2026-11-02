import { Injectable } from "@nestjs/common";

/** Time source for the Zalo module (windows, reminders, token expiry). Overridden in tests. */
@Injectable()
export class ZaloClock {
  now(): Date {
    return new Date();
  }
}
