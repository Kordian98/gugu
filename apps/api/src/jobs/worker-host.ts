import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Worker } from "bullmq";
import { AppConfig } from "../infrastructure/config/app-config";
import { RedisService } from "../infrastructure/redis/redis.service";
import { JOB_PROCESSORS, type JobProcessor } from "./processor";

/** Starts one BullMQ Worker per queue with registered processors (worker process only). */
@Injectable()
export class WorkerHost implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHost.name);
  private readonly workers: Worker[] = [];

  constructor(
    private readonly config: AppConfig,
    @Inject(JOB_PROCESSORS) private readonly processors: JobProcessor[],
  ) {}

  onApplicationBootstrap(): void {
    for (const processor of this.processors) {
      const worker = new Worker(processor.queue, (job, token) => processor.process(job, token), {
        connection: RedisService.connect(this.config.env.REDIS_URL),
        concurrency: 5,
      });
      worker.on("failed", (job, err) => {
        this.logger.warn(
          { queue: processor.queue, job: job?.name, jobId: job?.id, err: err.message },
          "job failed",
        );
      });
      this.workers.push(worker);
      this.logger.log(`worker listening on queue "${processor.queue}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
