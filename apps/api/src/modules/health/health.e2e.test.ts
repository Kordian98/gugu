import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { healthReportSchema } from "@gugu/contracts";
import { createTestApp, down, http } from "../../../test/http-app";

describe("GET /api/v1/health", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("returns 200 and a contract-valid report when all dependencies are up", async () => {
    app = await createTestApp();
    const res = await request(http(app)).get("/api/v1/health").expect(200);
    expect(healthReportSchema.parse(res.body).status).toBe("ok");
  });

  it("returns 503 with the failing check when the database is down", async () => {
    app = await createTestApp({ database: down });
    const res = await request(http(app)).get("/api/v1/health").expect(503);
    const report = healthReportSchema.parse(res.body);
    expect(report.status).toBe("down");
    expect(report.checks.database).toEqual(down);
    expect(report.checks.redis.status).toBe("up");
  });

  it("returns 503 when Redis is down", async () => {
    app = await createTestApp({ redis: down });
    await request(http(app)).get("/api/v1/health").expect(503);
  });

  it("serves liveness without dependency checks", async () => {
    app = await createTestApp({ database: down, redis: down });
    await request(http(app)).get("/api/v1/health/live").expect(200, { status: "ok" });
  });
});
