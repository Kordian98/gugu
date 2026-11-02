import { Body, Controller, Get, type INestApplication, Post } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { problemSchema } from "@gugu/contracts";
import { createTestApp, http } from "../../../test/http-app";
import { AppError } from "./app-error";

const echoInput = z.object({ name: z.string().min(1), age: z.number().int() });

@Controller("test-problem")
class ProblemTestController {
  @Post("echo")
  echo(@Body({ schema: echoInput }) body: z.infer<typeof echoInput>) {
    return body;
  }

  @Get("conflict")
  conflict() {
    throw new AppError(409, "booking.slot_taken", "Slot already taken", {
      detail: "Pick another time",
    });
  }

  @Get("boom")
  boom() {
    throw new Error("connect ECONNREFUSED postgresql://gugu:secret@db/gugu");
  }
}

describe("problem+json errors", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProblemTestController] });
  });
  afterAll(async () => {
    await app.close();
  });

  it("maps unknown routes to a 404 problem with traceId = x-request-id", async () => {
    const res = await request(http(app)).get("/api/v1/nope").expect(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const problem = problemSchema.parse(res.body);
    expect(problem).toMatchObject({ code: "common.not_found", instance: "/api/v1/nope" });
    expect(problem.traceId).toBe(res.headers["x-request-id"]);
  });

  it("returns field-level errors for invalid bodies", async () => {
    const res = await request(http(app))
      .post("/api/v1/test-problem/echo")
      .send({ name: "", age: "x" })
      .expect(400);
    const problem = problemSchema.parse(res.body);
    expect(problem.code).toBe("common.validation_failed");
    expect(problem.errors?.map((e) => e.path).sort()).toEqual(["age", "name"]);
  });

  it("passes valid bodies through the global Zod pipe", async () => {
    await request(http(app))
      .post("/api/v1/test-problem/echo")
      .send({ name: "Lan", age: 24 })
      .expect(201, { name: "Lan", age: 24 });
  });

  it("renders AppError with its stable code and status", async () => {
    const res = await request(http(app)).get("/api/v1/test-problem/conflict").expect(409);
    expect(res.body).toMatchObject({
      code: "booking.slot_taken",
      title: "Slot already taken",
      detail: "Pick another time",
    });
  });

  it("hides internal error messages, stacks and secrets on 500", async () => {
    const res = await request(http(app)).get("/api/v1/test-problem/boom").expect(500);
    expect(res.body).toMatchObject({
      code: "common.internal_error",
      title: "Internal Server Error",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|secret|stack|at /);
  });

  it("echoes a well-formed incoming x-request-id and replaces a malformed one", async () => {
    const ok = await request(http(app))
      .get("/api/v1/health/live")
      .set("x-request-id", "req-12345678");
    expect(ok.headers["x-request-id"]).toBe("req-12345678");
    const bad = await request(http(app)).get("/api/v1/health/live").set("x-request-id", "<script>");
    expect(bad.headers["x-request-id"]).not.toBe("<script>");
  });

  it("does not advertise the framework", async () => {
    const res = await request(http(app)).get("/api/v1/health/live");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
