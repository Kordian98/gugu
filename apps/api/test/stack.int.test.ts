// Integration against the local stack (`pnpm stack:up`): real Postgres + Valkey, no fakes.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Queue, QueueEvents } from "bullmq";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/bootstrap";
import { RedisService } from "../src/infrastructure/redis/redis.service";
import { QUEUES } from "../src/infrastructure/queue/queues";
import { MAINTENANCE_JOBS } from "../src/jobs/maintenance.processor";
import { WorkerModule } from "../src/worker.module";
import { http } from "./http-app";

describe("local stack", () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health reports database and Redis up", async () => {
    const res = await request(http(app)).get("/api/v1/health").expect(200);
    expect(res.body).toMatchObject({
      status: "ok",
      checks: { database: { status: "up" }, redis: { status: "up" } },
    });
  });

  it("worker processes a heartbeat job from Valkey", async () => {
    const worker = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await worker.init();
    const url = process.env["REDIS_URL"] ?? "";
    const queue = new Queue(QUEUES.maintenance, { connection: RedisService.connect(url) });
    const events = new QueueEvents(QUEUES.maintenance, { connection: RedisService.connect(url) });
    try {
      await events.waitUntilReady();
      const requestedAt = new Date().toISOString();
      const job = await queue.add(
        MAINTENANCE_JOBS.heartbeat,
        { requestedAt },
        { jobId: `int-${requestedAt}` },
      );
      await expect(job.waitUntilFinished(events, 10_000)).resolves.toMatchObject({ requestedAt });
    } finally {
      await queue.close();
      await events.close();
      await worker.close();
    }
  });
});
