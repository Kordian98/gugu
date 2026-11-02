import { Module } from "@nestjs/common";
import { INFRASTRUCTURE_MODULES } from "./app.module";
import { JobsModule } from "./jobs/jobs.module";

/** BullMQ worker process: same infrastructure as the API, no HTTP. */
@Module({ imports: [...INFRASTRUCTURE_MODULES, JobsModule] })
export class WorkerModule {}
