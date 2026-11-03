import { describe, expect, it } from "vitest";
import { SUSPENSION_WRITE_ALLOWLIST } from "../../common/guards/auth-policy";
import { assertWritable } from "./auth.guard";
import { policyViolations, type RouteInfo, suspensionAllowlistViolations } from "./route-inventory";

const route = (p: Partial<RouteInfo>): RouteInfo => ({
  method: "GET",
  path: "x",
  controller: "C",
  handler: "h",
  policy: { kind: "public" },
  allowWhileSuspended: false,
  ...p,
});

describe("policyViolations", () => {
  it("flags routes without a policy", () => {
    expect(policyViolations([route({ policy: undefined })])).toHaveLength(1);
  });

  it("flags salon routes without :salonId", () => {
    expect(
      policyViolations([
        route({ path: "salons", policy: { kind: "salon", permission: "salon.read" } }),
      ]),
    ).toHaveLength(1);
    expect(
      policyViolations([
        route({ path: "salons/:salonId", policy: { kind: "salon", permission: "salon.read" } }),
      ]),
    ).toHaveLength(0);
  });
});

describe("suspension allow-list (q92)", () => {
  const listed = (): RouteInfo[] =>
    SUSPENSION_WRITE_ALLOWLIST.map((a) =>
      route({
        method: a.method,
        path: a.path,
        policy: { kind: "salon", permission: a.permission },
        allowWhileSuspended: true,
      }),
    );

  it("accepts exactly the listed routes", () => {
    expect(suspensionAllowlistViolations(listed())).toEqual([]);
  });

  it("flags the decorator on an unlisted route, method or permission", () => {
    const extra = [
      route({
        method: "POST",
        path: "salons/:salonId/bookings",
        policy: { kind: "salon", permission: "bookings.write" },
        allowWhileSuspended: true,
      }),
      route({
        method: "DELETE",
        path: "salons/:salonId/privacy/exports",
        policy: { kind: "salon", permission: "customers.export" },
        allowWhileSuspended: true,
      }),
    ];
    expect(suspensionAllowlistViolations([...listed(), ...extra])).toHaveLength(2);
    const wrongPermission = listed().map((r) =>
      r.path.endsWith("/erase")
        ? { ...r, policy: { kind: "salon" as const, permission: "customers.export" as const } }
        : r,
    );
    // The erase route is now unlisted AND the listed erase entry is unmarked.
    expect(suspensionAllowlistViolations(wrongPermission)).toHaveLength(2);
  });

  it("flags a listed route that lost its decorator", () => {
    const [first, second] = listed();
    if (!first || !second) throw new Error("allow-list shorter than expected");
    expect(
      suspensionAllowlistViolations([first, { ...second, allowWhileSuspended: false }]),
    ).toHaveLength(1);
  });
});

describe("assertWritable", () => {
  const suspended = { suspended: true };
  const exempt = { allowWhileSuspended: true, permission: "customers.erase" as const };
  const plain = { allowWhileSuspended: false, permission: "customers.erase" as const };

  it("lets reads through and refuses writes of a suspended salon", () => {
    expect(() => {
      assertWritable(suspended, "GET", plain);
    }).not.toThrow();
    expect(() => {
      assertWritable(suspended, "POST", plain);
    }).toThrow(/suspended/);
    expect(() => {
      assertWritable({ suspended: false }, "POST", plain);
    }).not.toThrow();
  });

  it("honours the decorator only for the exempt permissions", () => {
    expect(() => {
      assertWritable(suspended, "POST", exempt);
    }).not.toThrow();
    expect(() => {
      assertWritable(suspended, "POST", {
        allowWhileSuspended: true,
        permission: "bookings.write",
      });
    }).toThrow(/suspended/);
  });
});
