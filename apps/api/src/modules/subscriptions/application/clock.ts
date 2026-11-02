import { Injectable } from "@nestjs/common";

/** Injectable time source so tests can freeze "now" (skill `testing`). */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
