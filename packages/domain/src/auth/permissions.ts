/**
 * Permission matrix — single source of truth for salon and platform authorization
 * (docs/tasks/05-auth-security.md §3.4). The API enforces it; the app may use it only to hide UI.
 * Permission strings are `<resource>.<action>[.own]`; `.own` variants restrict to the member's own
 * bookings/customers/schedule and are checked again in the service layer.
 */

export const SALON_ROLES = ["owner", "manager", "receptionist", "staff"] as const;
export type SalonRole = (typeof SALON_ROLES)[number];

export const ORGANIZATION_ROLES = ["org_owner", "org_manager", "org_viewer"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const PLATFORM_ROLES = ["support_admin", "super_admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const SALON_PERMISSIONS = [
  "salon.read",
  "salon.profile.write",
  "salon.settings.write",
  "salon.delete",
  "members.read",
  "members.invite",
  "members.roles.write",
  "services.write",
  /** Internal cost per service/variant/add-on and margins (owner, manager). Never public/AI. */
  "services.cost.read",
  "schedules.read",
  "schedules.write",
  "schedules.own.request_time_off",
  "bookings.read",
  "bookings.read.own",
  "bookings.write",
  "bookings.write.own",
  /** Book outside hours / lead time / window (audited, q18). Never lifts the overlap guarantee. */
  "bookings.override_rules",
  "customers.read",
  "customers.read.own",
  "customers.phone.read",
  "customers.notes.write",
  "customers.export",
  "customers.block",
  "analytics.read",
  "analytics.read.own",
  "reviews.respond",
  "integrations.zalo.manage",
  "zalo.inbox.use",
  "assistant.use",
  "billing.manage",
  "subscription.read",
  "audit.read",
] as const;
export type SalonPermission = (typeof SALON_PERMISSIONS)[number];

/**
 * Platform (GuGu staff) permissions. Platform roles are a column on the user, never a salon
 * membership; a salon role grants none of these. Admin API: `/api/v1/admin/*` (topic 12 M12.6).
 */
export const PLATFORM_PERMISSIONS = [
  /** Salon directory and detail (members, subscription, usage). */
  "platform.directory.read",
  "platform.moderation.write",
  "platform.salons.verify",
  "platform.salons.suspend",
  "platform.impersonate.readonly",
  "platform.roles.write",
  "platform.feature_flags.write",
  "platform.commission.write",
  "platform.audit.read",
  /** AI cost vs caps and messaging usage per salon. */
  "platform.usage.read",
  /** Plan assignment, trial extension, paid-until (manual billing). Money config: super only. */
  "platform.subscriptions.write",
  /** Per-salon entitlement overrides with an expiry. */
  "platform.entitlements.write",
  /** Grant or revoke the founding-partner flag (X20, spec 12 R-FP2: super_admin only). */
  "platform.founding_partner.write",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/** Never grantable to anyone but the owner, not even through overrides (spec G6). */
export const OWNER_ONLY_PERMISSIONS: readonly SalonPermission[] = [
  "salon.delete",
  "members.roles.write",
  "customers.export",
  "integrations.zalo.manage",
  "billing.manage",
];

const ALL_SALON = new Set<SalonPermission>(SALON_PERMISSIONS);

const MANAGER: readonly SalonPermission[] = SALON_PERMISSIONS.filter(
  (p) => !OWNER_ONLY_PERMISSIONS.includes(p),
);

const RECEPTIONIST: readonly SalonPermission[] = [
  "salon.read",
  "members.read",
  "schedules.read",
  "bookings.read",
  "bookings.write",
  "bookings.override_rules",
  "customers.read",
  "customers.phone.read",
  "customers.notes.write",
  "customers.block",
  "zalo.inbox.use",
];

/** Staff see customer phone numbers by default (owner answer q24); the owner can revoke it. */
const STAFF: readonly SalonPermission[] = [
  "salon.read",
  "schedules.read",
  "schedules.own.request_time_off",
  "bookings.read.own",
  "bookings.write.own",
  "customers.read.own",
  "customers.phone.read",
  "customers.notes.write",
  "analytics.read.own",
];

export const ROLE_PERMISSIONS: Readonly<Record<SalonRole, ReadonlySet<SalonPermission>>> = {
  owner: ALL_SALON,
  manager: new Set(MANAGER),
  receptionist: new Set(RECEPTIONIST),
  staff: new Set(STAFF),
};

/** Organisation roles act as this salon role on every salon of the organisation (spec 04 §3.2). */
export const ORGANIZATION_ROLE_AS_SALON_ROLE: Readonly<Record<OrganizationRole, SalonRole | null>> =
  {
    org_owner: "owner",
    org_manager: "manager",
    org_viewer: null,
  };

export const ORG_VIEWER_PERMISSIONS: ReadonlySet<SalonPermission> = new Set([
  "salon.read",
  "analytics.read",
]);

export const PLATFORM_ROLE_PERMISSIONS: Readonly<
  Record<PlatformRole, ReadonlySet<PlatformPermission>>
> = {
  super_admin: new Set(PLATFORM_PERMISSIONS),
  // Spec 12 R-AD4: support reads everything except money configuration and changes nothing
  // commercial (plans, overrides, founding partners, suspensions are super_admin only).
  // Impersonation is super_admin only (spec G15).
  support_admin: new Set([
    "platform.directory.read",
    "platform.audit.read",
    "platform.usage.read",
    "platform.moderation.write",
    "platform.salons.verify",
  ]),
};

/** Per-membership override (`salon_members.permissions_override`). */
export interface PermissionOverride {
  grant?: readonly string[];
  revoke?: readonly string[];
}

export const isSalonPermission = (p: string): p is SalonPermission =>
  ALL_SALON.has(p as SalonPermission);

const ROLE_RANK: Readonly<Record<SalonRole, number>> = {
  owner: 4,
  manager: 3,
  receptionist: 2,
  staff: 1,
};

/** The stronger of two roles (a user can be a salon member and an organisation member). */
export function strongestRole(a: SalonRole | null, b: SalonRole | null): SalonRole | null {
  if (!a) return b;
  if (!b) return a;
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

/**
 * Effective permissions of one membership: role bundle, then overrides. Grants of owner-only or
 * unknown permissions are ignored; revokes always apply.
 */
export function effectiveSalonPermissions(
  role: SalonRole,
  override: PermissionOverride | null = null,
): ReadonlySet<SalonPermission> {
  const result = new Set(ROLE_PERMISSIONS[role]);
  for (const p of override?.grant ?? []) {
    if (isSalonPermission(p) && (role === "owner" || !OWNER_ONLY_PERMISSIONS.includes(p))) {
      result.add(p);
    }
  }
  for (const p of override?.revoke ?? []) {
    if (isSalonPermission(p) && !(role === "owner" && OWNER_ONLY_PERMISSIONS.includes(p))) {
      result.delete(p);
    }
  }
  return result;
}

/** Which roles a member with `actor` role may assign (managers can't create owners/managers). */
export function canAssignRole(actor: SalonRole, target: SalonRole): boolean {
  if (actor === "owner") return target !== "owner";
  if (actor === "manager") return target === "receptionist" || target === "staff";
  return false;
}
