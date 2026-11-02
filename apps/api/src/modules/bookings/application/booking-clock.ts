import { Injectable } from "@nestjs/common";

/** Injectable time source so tests can freeze "now" (skill `testing`). */
@Injectable()
export class BookingClock {
  now(): Date {
    return new Date();
  }
}
