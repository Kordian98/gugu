import { Global, Module } from "@nestjs/common";
import { APP_GUARD, DiscoveryModule } from "@nestjs/core";
import { AuthModule } from "../auth/auth.facade";
import { AuthGuard } from "./auth.guard";
import { AuthorizationBootCheck } from "./authorization-boot-check";
import { MembershipService } from "./membership.service";

/** Global auth guard + tenant context + default-deny boot check (spec 05 §3.3–3.5). */
@Global()
@Module({
  imports: [DiscoveryModule, AuthModule],
  providers: [
    MembershipService,
    AuthorizationBootCheck,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [MembershipService],
})
export class AuthorizationModule {}
