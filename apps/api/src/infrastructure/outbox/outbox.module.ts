import { Global, Module } from "@nestjs/common";
import { OutboxRelay } from "./outbox.relay";

/** Outbox relay for the API (kick after commit) and the worker (publish + deliver). */
@Global()
@Module({ providers: [OutboxRelay], exports: [OutboxRelay] })
export class OutboxModule {}
