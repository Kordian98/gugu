import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, http } from "../test/http-app";

describe("OpenAPI", () => {
  it("serves Swagger UI at /api/docs and documents health with Zod-derived schemas", async () => {
    const app = await createTestApp();
    try {
      await request(http(app)).get("/api/docs").expect(200);
      const res = await request(http(app)).get("/api/docs-json").expect(200);
      const doc = res.body as {
        paths: Record<string, { get: { operationId: string; responses: Record<string, unknown> } }>;
      };
      expect(doc.paths["/api/v1/health"]?.get.operationId).toBe("health.ready");
      expect(JSON.stringify(doc.paths["/api/v1/health"]?.get.responses["200"])).toContain(
        '"uptimeSeconds"',
      );
      expect(doc.paths["/api/v1/health/live"]).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
