// q92 (owner 2026-11-04): while a salon is suspended, only client erasure and the salon-wide export
// start stay writable. Generated route matrix over the REAL app (no stack): a fake membership makes
// the caller the owner of a suspended salon with every permission; every non-GET salon route must
// answer 403 salon.suspended except exactly the SUSPENSION_WRITE_ALLOWLIST routes.
import { Controller, Post } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SALON_SUSPENDED_ERROR } from "@gugu/contracts";
import { SALON_PERMISSIONS } from "@gugu/domain";
import { FAKE_BEARER, fakeAuthOverrides } from "../../../test/auth-fakes";
import { createTestApp, http } from "../../../test/http-app";
import {
  AllowWhileSuspended,
  RequirePermission,
  SUSPENSION_WRITE_ALLOWLIST,
} from "../../common/guards/auth-policy";
import { MembershipService } from "./authorization.facade";
import { listRoutes, type RouteInfo } from "./route-inventory";

const SALON_ID = "0190f000-0000-7000-8000-0000000000aa";
const PLACEHOLDER_ID = "0190f000-0000-7000-8000-0000000000bb";

@Controller("salons/:salonId/test-unlisted")
class UnlistedExemptionController {
  @Post()
  @RequirePermission("bookings.write")
  @AllowWhileSuspended()
  write() {
    return {};
  }
}

@Controller("salons/:salonId/customers/:customerId")
class WrongPermissionController {
  // Same method + path as an allow-listed route would be a duplicate; use a listed path with a
  // different permission through a distinct controller prefix instead.
  @Post("erase-again")
  @RequirePermission("customers.erase")
  @AllowWhileSuspended()
  write() {
    return {};
  }
}

describe("suspension write allow-list (q92)", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let routes: RouteInfo[];

  beforeAll(async () => {
    const overrides = fakeAuthOverrides({ permissions: SALON_PERMISSIONS });
    const membership = overrides.find((o) => o.provide === MembershipService);
    if (!membership) throw new Error("fake membership missing");
    membership.useValue = {
      resolve: (_: string, salonId: string) =>
        Promise.resolve({
          salonId,
          organizationId: "0190f000-0000-7000-8000-000000000003",
          role: "owner",
          permissions: new Set(SALON_PERMISSIONS),
          suspended: true,
        }),
    };
    app = await createTestApp({ overrides });
    routes = listRoutes(app.get(DiscoveryService), app.get(MetadataScanner), app.get(Reflector));
  });

  afterAll(async () => {
    await app.close();
  });

  it("only the allow-listed routes carry @AllowWhileSuspended", () => {
    const marked = routes
      .filter((r) => r.allowWhileSuspended)
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(marked).toEqual(SUSPENSION_WRITE_ALLOWLIST.map((a) => `${a.method} ${a.path}`).sort());
    expect(marked).toEqual([
      "POST salons/:salonId/customers/:customerId/erase",
      "POST salons/:salonId/privacy/exports",
    ]);
  });

  it("every other non-GET salon route answers 403 salon.suspended; the allow-list passes the guard", async () => {
    const writes = routes.filter((r) => r.policy?.kind === "salon" && r.method !== "GET");
    expect(writes.length).toBeGreaterThanOrEqual(20);
    const url = (r: RouteInfo) =>
      `/api/v1/${r.path.replace(":salonId", SALON_ID).replace(/:[A-Za-z]+/g, PLACEHOLDER_ID)}`;
    const leaks: string[] = [];
    const exemptBlocked: string[] = [];
    for (const r of writes) {
      const method = r.method.toLowerCase() as "post" | "patch" | "put" | "delete";
      const agent = request(http(app));
      const res = await agent[method](url(r)).set("authorization", FAKE_BEARER).send({});
      const code = (res.body as { code?: string }).code;
      const suspendedAnswer = res.status === 403 && code === SALON_SUSPENDED_ERROR;
      if (r.allowWhileSuspended) {
        if (code === SALON_SUSPENDED_ERROR) exemptBlocked.push(`${r.method} ${r.path}`);
      } else if (!suspendedAnswer) {
        leaks.push(`${r.method} ${r.path} → ${String(res.status)} ${String(code)}`);
      }
    }
    expect(leaks, "salon writes not refused while suspended").toEqual([]);
    expect(exemptBlocked, "allow-listed writes refused while suspended").toEqual([]);
  });

  it("refuses to boot when an unlisted route carries @AllowWhileSuspended", async () => {
    await expect(createTestApp({ controllers: [UnlistedExemptionController] })).rejects.toThrow(
      /test-unlisted.*outside SUSPENSION_WRITE_ALLOWLIST/s,
    );
    await expect(createTestApp({ controllers: [WrongPermissionController] })).rejects.toThrow(
      /erase-again.*outside SUSPENSION_WRITE_ALLOWLIST/s,
    );
  });
});
