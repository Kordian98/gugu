import { Module } from "@nestjs/common";
import { MaintenanceProcessor } from "./maintenance.processor";
import { JOB_PROCESSORS, type JobProcessor } from "./processor";
import { WorkerHost } from "./worker-host";

@Module({
  providers: [
    MaintenanceProcessor,
    {
      provide: JOB_PROCESSORS,
      inject: [MaintenanceProcessor],
      useFactory: (...processors: JobProcessor[]) => processors,
    },
    WorkerHost,
  ],
})
export class JobsModule {}
