import { Controller, Get } from "@nestjs/common";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, http } from "../../../test/http-app";
import { RequirePermission } from "../../common/guards/auth-policy";

@Controller("test-unguarded")
class UnguardedController {
  @Get()
  get() {
    return { leaked: true };
  }
}

@Controller("test-bad-salon-route")
class SalonRouteWithoutParamController {
  @Get()
  @RequirePermission("salon.read")
  get() {
    return {};
  }
}

describe("default deny (spec 05 AC14)", () => {
  it("refuses to boot when a route has no auth policy", async () => {
    await expect(createTestApp({ controllers: [UnguardedController] })).rejects.toThrow(
      /test-unguarded.*no auth policy/s,
    );
  });

  it("refuses to boot when a salon route lacks :salonId", async () => {
    await expect(
      createTestApp({ controllers: [SalonRouteWithoutParamController] }),
    ).rejects.toThrow(/needs a :salonId/);
  });

  it("boots the real app: every route declares a policy; OpenAPI lists auth routes", async () => {
    const app = await createTestApp();
    const res = await request(http(app)).get("/api/docs-json").expect(200);
    const paths = Object.keys((res.body as { paths: Record<string, unknown> }).paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/auth/magic-link",
        "/api/v1/auth/magic-link/verify",
        "/api/v1/auth/refresh",
        "/api/v1/me",
        "/api/v1/salons/quick-start",
        "/api/v1/salons/{salonId}",
      ]),
    );
    await app.close();
  });
});
