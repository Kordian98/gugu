import { Module } from "@nestjs/common";
import { AccountsService } from "./application/accounts.service";
import { MagicLinkService } from "./application/magic-link.service";
import { PendingMembershipsService } from "./application/pending-memberships.service";
import { SessionService } from "./application/session.service";
import { SignInService } from "./application/sign-in.service";
import { AdminMfaController } from "./http/admin-mfa.controller";
import { AuthController } from "./http/auth.controller";
import { MeController } from "./http/me.controller";
import { IdTokenVerifier } from "./infra/id-token-verifier";
import { AdminMfaResetService } from "./mfa/admin-mfa-reset.service";
import { AdminMfaService } from "./mfa/admin-mfa.service";

/**
 * Identity and sessions (docs/tasks/05-auth-security.md §3.1–3.2, docs/domains/auth-security.md).
 * Other modules use only `auth.facade.ts`.
 */
@Module({
  controllers: [AuthController, MeController, AdminMfaController],
  providers: [
    AccountsService,
    MagicLinkService,
    PendingMembershipsService,
    SessionService,
    SignInService,
    IdTokenVerifier,
    AdminMfaService,
    AdminMfaResetService,
  ],
  exports: [
    AccountsService,
    MagicLinkService,
    SessionService,
    AdminMfaService,
    AdminMfaResetService,
  ],
})
export class AuthModule {}
