import { describe, expect, it } from "vitest";
import { policyViolations, type RouteInfo } from "./route-inventory";

const route = (p: Partial<RouteInfo>): RouteInfo => ({
  method: "GET",
  path: "x",
  controller: "C",
  handler: "h",
  policy: { kind: "public" },
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
