import { Module } from "@nestjs/common";
import { BookingsWorkerModule } from "../modules/bookings/bookings.facade";
import { ZaloWorkerModule } from "../modules/zalo/zalo.facade";
import { MaintenanceProcessor } from "./maintenance.processor";
import { ZaloProcessor } from "./zalo.processor";
import { JOB_PROCESSORS, type JobProcessor } from "./processor";
import { WorkerHost } from "./worker-host";

@Module({
  imports: [BookingsWorkerModule, ZaloWorkerModule],
  providers: [
    MaintenanceProcessor,
    ZaloProcessor,
    {
      provide: JOB_PROCESSORS,
      inject: [MaintenanceProcessor, ZaloProcessor],
      useFactory: (...processors: JobProcessor[]) => processors,
    },
    WorkerHost,
  ],
})
export class JobsModule {}
