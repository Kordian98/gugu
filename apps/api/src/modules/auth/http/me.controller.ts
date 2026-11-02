import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { type MeResponse, meResponseSchema, problemSchema } from "@gugu/contracts";
import { Authenticated } from "../../../common/guards/auth-policy";
import { CurrentUser, type UserPrincipal } from "../../../common/guards/principal";
import { AccountsService } from "../application/accounts.service";
import { SessionService } from "../application/session.service";

@ApiTags("auth")
@Controller("me")
export class MeController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @Authenticated()
  @ApiOperation({
    operationId: "auth.me",
    summary: "The signed-in user, their salon memberships and (web) the CSRF token for writes.",
  })
  @ApiResponse({ status: 200, description: "Current user.", standardSchema: meResponseSchema })
  @ApiResponse({ status: 401, description: "Not signed in.", standardSchema: problemSchema })
  async me(@CurrentUser() user: UserPrincipal): Promise<MeResponse> {
    return {
      user: await this.accounts.me(user.userId),
      csrfToken: user.sessionKind === "web" ? this.sessions.csrfToken(user.sessionId) : null,
    };
  }
}
