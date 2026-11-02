import type { SalonPermission, SalonRole } from "@gugu/domain";
import { SessionService } from "../src/modules/auth/auth.facade";
import { MembershipService } from "../src/modules/authorization/authorization.facade";

/** Header to send with `fakeAuthOverrides` (any bearer value is accepted by the fake). */
export const FAKE_BEARER = "Bearer test-token";

/**
 * Provider overrides for HTTP tests without the stack: every bearer token is user `userId`, who is
 * a member of any salon with `permissions`. Use only to test a module's own behaviour; tenant
 * isolation itself is covered by the integration suites against the real guard.
 */
export function fakeAuthOverrides(opts: {
  userId?: string;
  role?: SalonRole;
  permissions: readonly SalonPermission[];
}): { provide: unknown; useValue: unknown }[] {
  const userId = opts.userId ?? "0190f000-0000-7000-8000-000000000001";
  return [
    {
      provide: SessionService,
      useValue: {
        authenticate: () =>
          Promise.resolve({
            principal: {
              kind: "user",
              userId,
              sessionId: "0190f000-0000-7000-8000-000000000002",
              sessionKind: "native",
              platformRole: null,
            },
            refreshedCookie: false,
          }),
        csrfToken: () => "csrf",
      },
    },
    {
      provide: MembershipService,
      useValue: {
        resolve: (_: string, salonId: string) =>
          Promise.resolve({
            salonId,
            organizationId: "0190f000-0000-7000-8000-000000000003",
            role: opts.role ?? "owner",
            permissions: new Set(opts.permissions),
          }),
      },
    },
  ];
}
