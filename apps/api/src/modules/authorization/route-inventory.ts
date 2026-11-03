import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import {
  ALLOW_WHILE_SUSPENDED,
  AUTH_POLICY,
  type AuthPolicy,
  SUSPENSION_WRITE_ALLOWLIST,
} from "../../common/guards/auth-policy";

export interface RouteInfo {
  method: string;
  /** Path relative to the global prefix/version, e.g. `salons/:salonId/members`. */
  path: string;
  controller: string;
  handler: string;
  policy: AuthPolicy | undefined;
  /** Carries `@AllowWhileSuspended()` (q92): only SUSPENSION_WRITE_ALLOWLIST routes may. */
  allowWhileSuspended: boolean;
}

const join = (...parts: string[]): string =>
  parts
    .flatMap((p) => p.split("/"))
    .filter(Boolean)
    .join("/");

/** Every HTTP route with its declared auth policy (used by the boot check and generated tests). */
export function listRoutes(
  discovery: DiscoveryService,
  scanner: MetadataScanner,
  reflector: Reflector,
): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as Record<string, unknown> | undefined;
    const type = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
    if (!instance || !type) continue;
    const prototype = Object.getPrototypeOf(instance) as object;
    const base = (Reflect.getMetadata(PATH_METADATA, type) as string | string[] | undefined) ?? "";
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[name] as object;
      const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (sub === undefined) continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
      const policy = reflector.getAllAndOverride<AuthPolicy | undefined>(AUTH_POLICY, [
        handler as () => void,
        type,
      ]);
      const allowWhileSuspended =
        reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_SUSPENDED, [
          handler as () => void,
          type,
        ]) === true;
      for (const b of [base].flat()) {
        for (const s of [sub].flat()) {
          routes.push({
            method: RequestMethod[method],
            path: join(b, s),
            controller: type.name,
            handler: name,
            policy,
            allowWhileSuspended,
          });
        }
      }
    }
  }
  return routes;
}

/** Problems that must stop the app from starting (default deny, spec 05 R15 / AC14). */
export function policyViolations(routes: readonly RouteInfo[]): string[] {
  const problems: string[] = [];
  for (const r of routes) {
    const where = `${r.method} /${r.path} (${r.controller}.${r.handler})`;
    if (!r.policy)
      problems.push(`${where}: no auth policy (@Public/@Authenticated/@RequirePermission)`);
    else if (r.policy.kind === "salon" && !r.path.split("/").includes(":salonId")) {
      problems.push(`${where}: @RequirePermission needs a :salonId path parameter`);
    }
  }
  return problems;
}

/**
 * q92: `@AllowWhileSuspended()` sits on exactly the SUSPENSION_WRITE_ALLOWLIST routes — same
 * method, path and permission, each exactly once. Anything else stops the app from starting.
 */
export function suspensionAllowlistViolations(routes: readonly RouteInfo[]): string[] {
  const problems: string[] = [];
  for (const r of routes) {
    const where = `${r.method} /${r.path} (${r.controller}.${r.handler})`;
    if (r.allowWhileSuspended) {
      const listed = SUSPENSION_WRITE_ALLOWLIST.some(
        (a) =>
          a.method === r.method &&
          a.path === r.path &&
          r.policy?.kind === "salon" &&
          r.policy.permission === a.permission,
      );
      if (!listed) {
        problems.push(`${where}: @AllowWhileSuspended outside SUSPENSION_WRITE_ALLOWLIST`);
      }
    }
  }
  for (const a of SUSPENSION_WRITE_ALLOWLIST) {
    const marked = routes.filter(
      (r) =>
        r.allowWhileSuspended &&
        r.method === a.method &&
        r.path === a.path &&
        r.policy?.kind === "salon" &&
        r.policy.permission === a.permission,
    );
    if (marked.length !== 1) {
      problems.push(
        `${a.method} /${a.path}: in SUSPENSION_WRITE_ALLOWLIST but ${String(marked.length)} routes carry @AllowWhileSuspended`,
      );
    }
  }
  return problems;
}
