import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type MeResponse,
  meResponseSchema,
  type PendingSalonList,
  pendingSalonListSchema,
  pendingSalonParamsSchema,
  problemSchema,
} from "@gugu/contracts";
import { Authenticated } from "../../../common/guards/auth-policy";
import { CurrentUser, type UserPrincipal } from "../../../common/guards/principal";
import { AccountsService } from "../application/accounts.service";
import { PendingMembershipsService } from "../application/pending-memberships.service";
import { SessionService } from "../application/session.service";

@ApiTags("auth")
@Controller("me")
export class MeController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionService,
    private readonly pending: PendingMembershipsService,
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

  @Get("pending-salons")
  @Authenticated()
  @ApiOperation({
    operationId: "auth.listPendingSalons",
    summary: "Salons registered with my email that wait for my explicit confirmation.",
  })
  @ApiResponse({
    status: 200,
    description: "Pending salons.",
    standardSchema: pendingSalonListSchema,
  })
  async pendingSalons(@CurrentUser() user: UserPrincipal): Promise<PendingSalonList> {
    return this.pending.list(user.userId);
  }

  @Post("pending-salons/:salonId/confirm")
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({
    operationId: "auth.confirmPendingSalon",
    summary: "Confirm I registered this salon: activates my owner membership (audited).",
  })
  @ApiResponse({ status: 204, description: "Confirmed." })
  @ApiResponse({
    status: 404,
    description: "No pending membership.",
    standardSchema: problemSchema,
  })
  async confirm(
    @CurrentUser() user: UserPrincipal,
    @Param({ schema: pendingSalonParamsSchema }) params: { salonId: string },
  ): Promise<void> {
    await this.pending.confirm(user.userId, params.salonId);
  }

  @Post("pending-salons/:salonId/decline")
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({
    operationId: "auth.declinePendingSalon",
    summary: "Not my salon: removes the pending owner membership (audited).",
  })
  @ApiResponse({ status: 204, description: "Declined." })
  @ApiResponse({
    status: 404,
    description: "No pending membership.",
    standardSchema: problemSchema,
  })
  async decline(
    @CurrentUser() user: UserPrincipal,
    @Param({ schema: pendingSalonParamsSchema }) params: { salonId: string },
  ): Promise<void> {
    await this.pending.decline(user.userId, params.salonId);
  }
}
