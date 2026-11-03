// The worker process resolves its whole DI graph (it does not load the API's global modules), and
// registers the privacy processor. TEST_DATABASE_URL only.
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { WorkerModule } from "../worker.module";
import { JOB_PROCESSORS, type JobProcessor } from "./processor";

describe("worker module (integration)", () => {
  it("compiles and registers every queue processor", async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    const processors = moduleRef.get<JobProcessor[]>(JOB_PROCESSORS);
    expect(processors.map((p) => p.queue).sort()).toEqual(
      ["maintenance", "notify", "outbox", "privacy", "zalo"].sort(),
    );
    await moduleRef.close();
  });
});
