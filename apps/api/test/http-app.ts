import type { Server } from "node:http";
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import type { HealthCheck } from "@gugu/contracts";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/bootstrap";
import { DATABASE_PROBE, REDIS_PROBE } from "../src/modules/health/application/probes";

export const up: HealthCheck = { status: "up", latencyMs: 1 };
export const down: HealthCheck = { status: "down", latencyMs: 2000, error: "timeout" };

/**
 * Boots the real AppModule (config, logger, filter, pipe, middleware, Swagger) with dependency
 * probes replaced, so HTTP behaviour is tested without the local stack. Prisma and Redis connect
 * lazily, so nothing touches the network.
 */
export async function createTestApp(
  opts: {
    database?: HealthCheck;
    redis?: HealthCheck;
    controllers?: Type[];
    /** Extra provider overrides (e.g. a module's ports), applied after the probe overrides. */
    overrides?: { provide: unknown; useValue: unknown }[];
  } = {},
): Promise<INestApplication> {
  process.env["NODE_ENV"] = "test";
  process.env["LOG_LEVEL"] = "silent";
  process.env["DATABASE_URL"] ??= "postgresql://gugu:gugu@127.0.0.1:1/never";
  process.env["REDIS_URL"] ??= "redis://127.0.0.1:1";
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: opts.controllers ?? [],
  })
    .overrideProvider(DATABASE_PROBE)
    .useValue({ check: () => Promise.resolve(opts.database ?? up) })
    .overrideProvider(REDIS_PROBE)
    .useValue({ check: () => Promise.resolve(opts.redis ?? up) });
  for (const o of opts.overrides ?? [])
    builder = builder.overrideProvider(o.provide).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureHttpApp(app);
  await app.init();
  return app;
}

/** Typed HTTP server for supertest (`getHttpServer()` is untyped in Nest). */
export function http(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
