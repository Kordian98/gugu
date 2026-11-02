import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { listRoutes, policyViolations } from "./route-inventory";

/** Refuses to start the app when any route lacks an auth policy (default deny, AC14). */
@Injectable()
export class AuthorizationBootCheck implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const problems = policyViolations(listRoutes(this.discovery, this.scanner, this.reflector));
    if (problems.length > 0) {
      throw new Error(`Routes without a valid auth policy:\n  - ${problems.join("\n  - ")}`);
    }
  }
}
