import { Controller, Get, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultEntitlementValue,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  type EntitlementMap,
  problemSchema,
  type SalonEntitlements,
  salonEntitlementsSchema,
} from "@gugu/contracts";
import { createTestApp, http } from "../../../../test/http-app";
import { uuidV7 } from "../../../../test/factories/ids";
import { EntitlementService } from "../application/entitlement.service";
import { RequiresEntitlement } from "./requires-entitlement";
import { SALON_ACCESS } from "./salon-access";

const allowAll = { assertCanRead: () => Promise.resolve() };
const noCache = {
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve(),
  delete: () => Promise.resolve(),
};

function entitlementsOf(overrides: Partial<EntitlementMap>): EntitlementMap {
  const base = Object.fromEntries(
    (Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[]).map((k) => [k, defaultEntitlementValue(k)]),
  );
  return { ...base, ...overrides } as EntitlementMap;
}

function fakeEntitlements(map: EntitlementMap): Partial<EntitlementService> {
  const forSalon = (salonId: string): Promise<SalonEntitlements> =>
    Promise.resolve({
      salonId,
      plan: "basic",
      status: "active",
      trialEndsAt: null,
      entitlements: map,
    });
  return {
    forSalon,
    assert: async (salonId, key) => {
      const real = new EntitlementService(null as never, null as never, noCache);
      Object.assign(real, { forSalon });
      await real.assert(salonId, key);
    },
  };
}

@Controller("salons/:salonId/test-ai")
class GatedController {
  @Get()
  @RequiresEntitlement("ai.agent.enabled")
  get() {
    return { ok: true };
  }
}

describe("GET /api/v1/salons/:salonId/entitlements", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("fails closed with 401 until topic 05 provides salon access", async () => {
    app = await createTestApp();
    const res = await request(http(app)).get(`/api/v1/salons/${uuidV7()}/entitlements`).expect(401);
    expect(problemSchema.parse(res.body).code).toBe("common.unauthorized");
  });

  it("returns a contract-valid read model for an allowed caller", async () => {
    app = await createTestApp({
      overrides: [
        { provide: SALON_ACCESS, useValue: allowAll },
        {
          provide: EntitlementService,
          useValue: fakeEntitlements(entitlementsOf({ "crm.core": true })),
        },
      ],
    });
    const salonId = uuidV7();
    const res = await request(http(app)).get(`/api/v1/salons/${salonId}/entitlements`).expect(200);
    const body = salonEntitlementsSchema.parse(res.body);
    expect(body.salonId).toBe(salonId);
    expect(body.entitlements["crm.core"]).toBe(true);
  });

  it("rejects a malformed salon id with 400", async () => {
    app = await createTestApp({ overrides: [{ provide: SALON_ACCESS, useValue: allowAll }] });
    const res = await request(http(app)).get("/api/v1/salons/not-a-uuid/entitlements").expect(400);
    expect(problemSchema.parse(res.body).code).toBe("common.validation_failed");
  });

  it("documents the endpoint in OpenAPI", async () => {
    app = await createTestApp();
    const res = await request(http(app)).get("/api/docs-json").expect(200);
    const doc = res.body as { paths: Record<string, { get?: { operationId?: string } }> };
    expect(doc.paths["/api/v1/salons/{salonId}/entitlements"]?.get?.operationId).toBe(
      "subscriptions.getEntitlements",
    );
  });
});

describe("@RequiresEntitlement", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("returns 403 entitlement.required when the plan lacks the feature", async () => {
    app = await createTestApp({
      controllers: [GatedController],
      overrides: [{ provide: EntitlementService, useValue: fakeEntitlements(entitlementsOf({})) }],
    });
    const res = await request(http(app)).get(`/api/v1/salons/${uuidV7()}/test-ai`).expect(403);
    const problem = problemSchema.parse(res.body);
    expect(problem.code).toBe("entitlement.required");
    expect(problem.detail).toBe("ai.agent.enabled");
  });

  it("lets the request through when the feature is granted", async () => {
    app = await createTestApp({
      controllers: [GatedController],
      overrides: [
        {
          provide: EntitlementService,
          useValue: fakeEntitlements(entitlementsOf({ "ai.agent.enabled": true })),
        },
      ],
    });
    await request(http(app)).get(`/api/v1/salons/${uuidV7()}/test-ai`).expect(200, { ok: true });
  });
});
