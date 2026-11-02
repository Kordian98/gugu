import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, http } from "../../../../test/http-app";
import { Public } from "../../../common/guards/auth-policy";
import { requestMeta } from "./http-meta";

@Controller("test-ip")
@Public()
class IpController {
  @Get()
  get(@Req() req: Request) {
    return requestMeta(req);
  }
}

describe("client IP behind proxies (TRUST_PROXY)", () => {
  afterEach(() => {
    delete process.env["TRUST_PROXY"];
  });

  it("ignores X-Forwarded-For by default (no trusted proxy)", async () => {
    const app = await createTestApp({ controllers: [IpController] });
    const res = await request(http(app))
      .get("/api/v1/test-ip")
      .set("x-forwarded-for", "203.0.113.9")
      .expect(200);
    expect((res.body as { ipPrefix: string }).ipPrefix).not.toBe("203.0.113.0/24");
    await app.close();
  });

  it("uses the forwarded client address with one trusted hop", async () => {
    process.env["TRUST_PROXY"] = "1";
    const app = await createTestApp({ controllers: [IpController] });
    const res = await request(http(app))
      .get("/api/v1/test-ip")
      .set("x-forwarded-for", "198.51.100.1, 203.0.113.9")
      .expect(200);
    // With one hop trusted, the right-most untrusted address is the client.
    expect((res.body as { ipPrefix: string }).ipPrefix).toBe("203.0.113.0/24");
    await app.close();
  });
});
