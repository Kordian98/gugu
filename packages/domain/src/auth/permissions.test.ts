import { describe, expect, it } from "vitest";
import {
  OWNER_ONLY_PERMISSIONS,
  ROLE_PERMISSIONS,
  SALON_PERMISSIONS,
  canAssignRole,
  effectiveSalonPermissions,
  strongestRole,
} from "./permissions";

describe("permission matrix", () => {
  it("gives the owner every salon permission", () => {
    expect(ROLE_PERMISSIONS.owner.size).toBe(SALON_PERMISSIONS.length);
  });

  it("never gives owner-only permissions to other roles", () => {
    for (const role of ["manager", "receptionist", "staff"] as const) {
      for (const p of OWNER_ONLY_PERMISSIONS) expect(ROLE_PERMISSIONS[role].has(p)).toBe(false);
    }
  });

  it("limits staff to own bookings but shows phones by default (q24)", () => {
    const staff = ROLE_PERMISSIONS.staff;
    expect(staff.has("bookings.read")).toBe(false);
    expect(staff.has("bookings.read.own")).toBe(true);
    expect(staff.has("customers.phone.read")).toBe(true);
    expect(staff.has("analytics.read")).toBe(false);
  });

  it("ignores grants of owner-only or unknown permissions", () => {
    const p = effectiveSalonPermissions("manager", {
      grant: ["billing.manage", "made.up", "customers.export"],
    });
    expect(p.has("billing.manage")).toBe(false);
    expect(p.has("customers.export")).toBe(false);
  });

  it("applies grants and revokes from overrides", () => {
    const p = effectiveSalonPermissions("staff", {
      grant: ["bookings.read"],
      revoke: ["customers.phone.read"],
    });
    expect(p.has("bookings.read")).toBe(true);
    expect(p.has("customers.phone.read")).toBe(false);
  });

  it("does not let overrides strip owner-only permissions from the owner", () => {
    expect(
      effectiveSalonPermissions("owner", { revoke: ["billing.manage"] }).has("billing.manage"),
    ).toBe(true);
  });

  it("picks the stronger role and restricts role assignment", () => {
    expect(strongestRole("staff", "manager")).toBe("manager");
    expect(strongestRole(null, "staff")).toBe("staff");
    expect(canAssignRole("manager", "manager")).toBe(false);
    expect(canAssignRole("manager", "staff")).toBe(true);
    expect(canAssignRole("owner", "owner")).toBe(false);
  });
});
