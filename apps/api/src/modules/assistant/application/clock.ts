import { Injectable } from "@nestjs/common";

/** "Now" for the assistant (today's date, relative periods). Evals pin it to a fixed instant. */
@Injectable()
export class AssistantClock {
  now(): number {
    return Date.now();
  }
}
