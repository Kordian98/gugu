import { Module } from "@nestjs/common";
import { DOMAIN_EVENT_HANDLERS } from "../infrastructure/outbox/domain-events";
import { BookingsWorkerModule } from "../modules/bookings/bookings.facade";
import { ZaloBookingEventsHandler, ZaloWorkerModule } from "../modules/zalo/zalo.facade";
import { MaintenanceProcessor } from "./maintenance.processor";
import { OutboxProcessor } from "./outbox.processor";
import { JOB_PROCESSORS, type JobProcessor } from "./processor";
import { WorkerHost } from "./worker-host";
import { ZaloProcessor } from "./zalo.processor";

@Module({
  imports: [BookingsWorkerModule, ZaloWorkerModule],
  providers: [
    MaintenanceProcessor,
    ZaloProcessor,
    OutboxProcessor,
    {
      // Outbox consumers (04-S5). Add a module's handler here; it must be idempotent.
      provide: DOMAIN_EVENT_HANDLERS,
      inject: [ZaloBookingEventsHandler],
      useFactory: (...handlers: unknown[]) => handlers,
    },
    {
      provide: JOB_PROCESSORS,
      inject: [MaintenanceProcessor, ZaloProcessor, OutboxProcessor],
      useFactory: (...processors: JobProcessor[]) => processors,
    },
    WorkerHost,
  ],
})
export class JobsModule {}
