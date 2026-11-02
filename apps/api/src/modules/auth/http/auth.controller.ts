import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  type AuthProviders,
  type AuthSession,
  authProvidersSchema,
  authSessionSchema,
  type MagicLinkRequestInput,
  magicLinkRequestInputSchema,
  type MagicLinkRequestResult,
  magicLinkRequestResultSchema,
  type MagicLinkVerifyInput,
  magicLinkVerifyInputSchema,
  type NativeTokens,
  nativeTokensSchema,
  problemSchema,
  type RefreshInput,
  refreshInputSchema,
  type SocialSignInInput,
  socialSignInInputSchema,
} from "@gugu/contracts";
import { Authenticated, Public } from "../../../common/guards/auth-policy";
import { CurrentUser, type UserPrincipal } from "../../../common/guards/principal";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { AuditService } from "../../audit/audit.facade";
import { AccountsService } from "../application/accounts.service";
import { MagicLinkService } from "../application/magic-link.service";
import { SessionService } from "../application/session.service";
import { type SignInResult, SignInService } from "../application/sign-in.service";
import { clearSessionCookie, requestMeta, setSessionCookie } from "../infra/http-meta";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly config: AppConfig,
    private readonly magicLinks: MagicLinkService,
    private readonly signIn: SignInService,
    private readonly sessions: SessionService,
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
  ) {}

  @Get("providers")
  @Public()
  @ApiOperation({
    operationId: "auth.providers",
    summary: "Sign-in methods enabled on this server.",
  })
  @ApiResponse({
    status: 200,
    description: "Enabled providers.",
    standardSchema: authProvidersSchema,
  })
  providers(): AuthProviders {
    return this.signIn.providers();
  }

  @Post("magic-link")
  @Public()
  @HttpCode(202)
  @ApiOperation({
    operationId: "auth.requestMagicLink",
    summary:
      "Email a sign-in link + 6-digit code. Same response whether or not the email has an account.",
  })
  @ApiResponse({
    status: 202,
    description: "Accepted.",
    standardSchema: magicLinkRequestResultSchema,
  })
  @ApiResponse({ status: 429, description: "Rate limited.", standardSchema: problemSchema })
  async requestMagicLink(
    @Body({ schema: magicLinkRequestInputSchema }) body: MagicLinkRequestInput,
    @Req() req: Request,
  ): Promise<MagicLinkRequestResult> {
    await this.magicLinks.request(body, requestMeta(req));
    return { status: "sent" };
  }

  @Post("magic-link/verify")
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: "auth.verifyMagicLink",
    summary:
      "Exchange a magic-link token (or email + code) for a session. Web: sets the httpOnly cookie.",
  })
  @ApiResponse({ status: 200, description: "Signed in.", standardSchema: authSessionSchema })
  @ApiResponse({
    status: 400,
    description: "Link invalid or expired.",
    standardSchema: problemSchema,
  })
  @ApiResponse({ status: 429, description: "Too many attempts.", standardSchema: problemSchema })
  async verifyMagicLink(
    @Body({ schema: magicLinkVerifyInputSchema }) body: MagicLinkVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.respond(await this.signIn.withMagicLink(body, requestMeta(req)), res);
  }

  @Post("social")
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: "auth.socialSignIn",
    summary: "Sign in with an Apple or Google ID token (disabled until client IDs are configured).",
  })
  @ApiResponse({ status: 200, description: "Signed in.", standardSchema: authSessionSchema })
  @ApiResponse({ status: 404, description: "Provider disabled.", standardSchema: problemSchema })
  @ApiResponse({ status: 401, description: "ID token invalid.", standardSchema: problemSchema })
  async social(
    @Body({ schema: socialSignInInputSchema }) body: SocialSignInInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.respond(await this.signIn.withProvider(body, requestMeta(req)), res);
  }

  @Post("refresh")
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: "auth.refresh",
    summary: "Native: rotate the refresh token. Reusing a spent token revokes the session.",
  })
  @ApiResponse({ status: 200, description: "New tokens.", standardSchema: nativeTokensSchema })
  @ApiResponse({
    status: 401,
    description: "Refresh token invalid.",
    standardSchema: problemSchema,
  })
  async refresh(
    @Body({ schema: refreshInputSchema }) body: RefreshInput,
    @Req() req: Request,
  ): Promise<NativeTokens> {
    return this.sessions.refresh(body.refreshToken, requestMeta(req));
  }

  @Post("sign-out")
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({ operationId: "auth.signOut", summary: "End the current session." })
  @ApiResponse({ status: 204, description: "Signed out." })
  async signOut(
    @CurrentUser() user: UserPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(user.sessionId, "sign_out");
    if (user.sessionKind === "web") clearSessionCookie(res, this.config.isProduction);
    const meta = requestMeta(req);
    await this.audit.record({
      action: "auth.sign_out",
      actor: { type: "user", id: user.userId },
      targetType: "session",
      targetId: user.sessionId,
      ipPrefix: meta.ipPrefix,
      userAgent: meta.userAgent,
    });
  }

  @Post("sign-out-all")
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({
    operationId: "auth.signOutAll",
    summary: "End every session of the current user.",
  })
  @ApiResponse({ status: 204, description: "All sessions ended." })
  async signOutAll(
    @CurrentUser() user: UserPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const count = await this.sessions.revokeAllForUser(user.userId, "sign_out_all");
    if (user.sessionKind === "web") clearSessionCookie(res, this.config.isProduction);
    await this.audit.record({
      action: "auth.sign_out_all",
      actor: { type: "user", id: user.userId },
      targetType: "user",
      targetId: user.userId,
      metadata: { sessions: count },
    });
  }

  private async respond(result: SignInResult, res: Response): Promise<AuthSession> {
    const user = await this.accounts.me(result.user.id);
    if (result.session.kind === "web") {
      setSessionCookie(res, this.config.isProduction, result.session.cookieSecret);
      return {
        user,
        session: { kind: "web", csrfToken: result.session.csrfToken },
        redirectPath: result.redirectPath,
      };
    }
    return {
      user,
      session: { kind: "native", tokens: result.session.tokens },
      redirectPath: result.redirectPath,
    };
  }
}
