import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { AUTH_POLICY, type AuthPolicy } from "../../common/guards/auth-policy";

export interface RouteInfo {
  method: string;
  /** Path relative to the global prefix/version, e.g. `salons/:salonId/members`. */
  path: string;
  controller: string;
  handler: string;
  policy: AuthPolicy | undefined;
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
      for (const b of [base].flat()) {
        for (const s of [sub].flat()) {
          routes.push({
            method: RequestMethod[method],
            path: join(b, s),
            controller: type.name,
            handler: name,
            policy,
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
