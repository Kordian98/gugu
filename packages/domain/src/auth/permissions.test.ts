import { describe, expect, it } from "vitest";
import {
  MANAGER_GRANTABLE_PERMISSIONS,
  OWNER_ONLY_PERMISSIONS,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
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

  it("internal service cost: owner and manager only", () => {
    expect(ROLE_PERMISSIONS.owner.has("services.cost.read")).toBe(true);
    expect(ROLE_PERMISSIONS.manager.has("services.cost.read")).toBe(true);
    expect(ROLE_PERMISSIONS.receptionist.has("services.cost.read")).toBe(false);
    expect(ROLE_PERMISSIONS.staff.has("services.cost.read")).toBe(false);
  });

  it("rule overrides: owner, manager, receptionist — not staff (q18)", () => {
    for (const role of ["owner", "manager", "receptionist"] as const) {
      expect(ROLE_PERMISSIONS[role].has("bookings.override_rules")).toBe(true);
    }
    expect(ROLE_PERMISSIONS.staff.has("bookings.override_rules")).toBe(false);
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

  it("platform roles: super_admin has everything, support_admin no commercial writes (R-AD4)", () => {
    expect([...PLATFORM_ROLE_PERMISSIONS.super_admin].sort()).toEqual(
      [...PLATFORM_PERMISSIONS].sort(),
    );
    const support = PLATFORM_ROLE_PERMISSIONS.support_admin;
    expect(support.has("platform.directory.read")).toBe(true);
    expect(support.has("platform.usage.read")).toBe(true);
    expect(support.has("platform.audit.read")).toBe(true);
    // Every admin must be able to enrol a second factor and step up (topic 05 step 9).
    expect(support.has("platform.mfa.self")).toBe(true);
    for (const p of [
      "platform.subscriptions.write",
      "platform.entitlements.write",
      "platform.founding_partner.write",
      "platform.salons.suspend",
      "platform.impersonate.readonly",
      "platform.roles.write",
      "platform.feature_flags.write",
      "platform.commission.write",
      // q93: only a super_admin can reset another admin's second factor.
      "platform.mfa.reset",
    ] as const) {
      expect(support.has(p)).toBe(false);
    }
  });

  it("privacy actions (client export, erase) are owner-only and never grantable", () => {
    for (const p of ["customers.export", "customers.erase"] as const) {
      expect(OWNER_ONLY_PERMISSIONS).toContain(p);
      expect(ROLE_PERMISSIONS.owner.has(p)).toBe(true);
      for (const role of ["manager", "receptionist", "staff"] as const) {
        expect(effectiveSalonPermissions(role, { grant: [p] }).has(p)).toBe(false);
      }
    }
  });

  it("salon roles never carry platform permissions", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) expect(p.startsWith("platform.")).toBe(false);
    }
  });

  it("payroll: owner only by default, grantable to managers only, own pay for everyone", () => {
    for (const p of ["payroll.read", "payroll.manage"] as const) {
      expect(MANAGER_GRANTABLE_PERMISSIONS).toContain(p);
      // Not owner-only: owner-only permissions can never be granted.
      expect(OWNER_ONLY_PERMISSIONS).not.toContain(p);
      expect(ROLE_PERMISSIONS.owner.has(p)).toBe(true);
      for (const role of ["manager", "receptionist", "staff"] as const) {
        expect(ROLE_PERMISSIONS[role].has(p)).toBe(false);
      }
      expect(effectiveSalonPermissions("manager", { grant: [p] }).has(p)).toBe(true);
      expect(effectiveSalonPermissions("receptionist", { grant: [p] }).has(p)).toBe(false);
      expect(effectiveSalonPermissions("staff", { grant: [p] }).has(p)).toBe(false);
    }
    for (const role of ["owner", "manager", "receptionist", "staff"] as const) {
      expect(ROLE_PERMISSIONS[role].has("payroll.self.read")).toBe(true);
    }
  });
});
