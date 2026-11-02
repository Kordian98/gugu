import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  type CreateInvitationInput,
  createInvitationInputSchema,
  type InvitationCreated,
  invitationAcceptedSchema,
  invitationCreatedSchema,
  type InvitationPreview,
  invitationPreviewSchema,
  invitationTokenInputSchema,
  memberParamsSchema,
  memberRoleInputSchema,
  problemSchema,
  salonParamsSchema,
  staffInputSchema,
  staffParamsSchema,
  type Team,
  teamSchema,
  type TimeOff,
  timeOffInputSchema,
  timeOffParamsSchema,
  timeOffSchema,
  uuidV7Schema,
  type WeeklySchedule,
  weeklyScheduleSchema,
} from "@gugu/contracts";
import { Authenticated, Public, RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { InvitationService } from "../application/invitation.service";
import { type StaffFields, TeamService } from "../application/team.service";

type StaffParams = { salonId: string; staffId: string };
const invitationParamsSchema = z.object({ salonId: uuidV7Schema, invitationId: uuidV7Schema });

@ApiTags("team")
@Controller()
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly invitations: InvitationService,
  ) {}

  @Get("salons/:salonId/team")
  @RequirePermission("members.read")
  @ApiOperation({
    operationId: "team.list",
    summary: "Staff with roles, services, schedules, time off, invites.",
  })
  @ApiResponse({ status: 200, description: "Team.", standardSchema: teamSchema })
  async list(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<Team> {
    return this.team.list(salon);
  }

  @Post("salons/:salonId/team")
  @RequirePermission("members.invite")
  @HttpCode(201)
  @ApiOperation({
    operationId: "team.createStaff",
    summary: "Add a staff member (account optional).",
  })
  @ApiResponse({
    status: 201,
    description: "Created.",
    standardSchema: z.object({ id: uuidV7Schema }),
  })
  async create(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: staffInputSchema }) body: StaffFields,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<{ id: string }> {
    return this.team.create(salon, body, user.userId);
  }

  @Patch("salons/:salonId/team/:staffId")
  @RequirePermission("members.invite")
  @HttpCode(204)
  @ApiOperation({ operationId: "team.updateStaff", summary: "Name, colour, bookable, services." })
  @ApiResponse({ status: 204, description: "Updated." })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  async update(
    @Param({ schema: staffParamsSchema }) p: StaffParams,
    @Body({ schema: staffInputSchema }) body: StaffFields,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.team.update(salon, p.staffId, body);
  }

  @Delete("salons/:salonId/team/:staffId")
  @RequirePermission("members.invite")
  @HttpCode(204)
  @ApiOperation({
    operationId: "team.removeStaff",
    summary: "Remove a staff member (linked accounts: owner only).",
  })
  @ApiResponse({ status: 204, description: "Removed." })
  async remove(
    @Param({ schema: staffParamsSchema }) p: StaffParams,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.team.remove(salon, p.staffId);
  }

  @Patch("salons/:salonId/team/:staffId/schedule")
  @RequirePermission("schedules.write")
  @HttpCode(204)
  @ApiOperation({
    operationId: "team.replaceSchedule",
    summary: "Replace weekly working hours and breaks from today.",
  })
  @ApiResponse({ status: 204, description: "Updated." })
  async schedule(
    @Param({ schema: staffParamsSchema }) p: StaffParams,
    @Body({ schema: weeklyScheduleSchema }) body: WeeklySchedule,
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.team.replaceSchedule(salon, p.staffId, body);
  }

  @Post("salons/:salonId/team/:staffId/time-off")
  @RequirePermission("schedules.write")
  @HttpCode(201)
  @ApiOperation({ operationId: "team.addTimeOff", summary: "Add time off." })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: timeOffSchema })
  async addTimeOff(
    @Param({ schema: staffParamsSchema }) p: StaffParams,
    @Body({ schema: timeOffInputSchema })
    body: { startsAt: string; endsAt: string; reason: string | null },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<TimeOff> {
    return this.team.addTimeOff(salon, p.staffId, body, user.userId);
  }

  @Delete("salons/:salonId/team/:staffId/time-off/:timeOffId")
  @RequirePermission("schedules.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "team.removeTimeOff", summary: "Remove time off." })
  @ApiResponse({ status: 204, description: "Removed." })
  async removeTimeOff(
    @Param({ schema: timeOffParamsSchema }) p: StaffParams & { timeOffId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.team.removeTimeOff(salon, p.staffId, p.timeOffId);
  }

  @Post("salons/:salonId/invitations")
  @RequirePermission("members.invite")
  @HttpCode(201)
  @ApiOperation({
    operationId: "team.invite",
    summary: "Create a single-use 72 h invitation link (optionally emailed).",
  })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: invitationCreatedSchema })
  @ApiResponse({ status: 403, description: "Role or seat limit.", standardSchema: problemSchema })
  async invite(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: createInvitationInputSchema }) body: CreateInvitationInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<InvitationCreated> {
    return this.invitations.create(salon, user, body);
  }

  @Delete("salons/:salonId/invitations/:invitationId")
  @RequirePermission("members.invite")
  @HttpCode(204)
  @ApiOperation({ operationId: "team.revokeInvitation", summary: "Revoke an open invitation." })
  @ApiResponse({ status: 204, description: "Revoked." })
  async revoke(
    @Param({ schema: invitationParamsSchema }) p: { salonId: string; invitationId: string },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.invitations.revoke(salon, p.invitationId);
  }

  @Patch("salons/:salonId/members/:memberId/role")
  @RequirePermission("members.roles.write")
  @HttpCode(204)
  @ApiOperation({ operationId: "team.changeRole", summary: "Change a member's role (owner only)." })
  @ApiResponse({ status: 204, description: "Updated." })
  async role(
    @Param({ schema: memberParamsSchema }) p: { salonId: string; memberId: string },
    @Body({ schema: memberRoleInputSchema }) body: { role: "manager" | "receptionist" | "staff" },
    @CurrentSalon() salon: SalonContext,
  ): Promise<void> {
    await this.invitations.changeRole(salon, p.memberId, body.role);
  }

  @Post("invitations/preview")
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: "team.previewInvitation",
    summary: "Salon name and role for an invitation token.",
  })
  @ApiResponse({ status: 200, description: "Preview.", standardSchema: invitationPreviewSchema })
  @ApiResponse({ status: 404, description: "Invalid.", standardSchema: problemSchema })
  async preview(
    @Body({ schema: invitationTokenInputSchema }) body: { token: string },
  ): Promise<InvitationPreview> {
    return this.invitations.preview(body.token);
  }

  @Post("invitations/accept")
  @Authenticated()
  @HttpCode(200)
  @ApiOperation({
    operationId: "team.acceptInvitation",
    summary: "Join the salon with the signed-in account.",
  })
  @ApiResponse({ status: 200, description: "Joined.", standardSchema: invitationAcceptedSchema })
  @ApiResponse({ status: 403, description: "Email mismatch.", standardSchema: problemSchema })
  async accept(
    @Body({ schema: invitationTokenInputSchema }) body: { token: string },
    @CurrentUser() user: UserPrincipal,
  ): Promise<{ salonId: string }> {
    return this.invitations.accept(user, body.token);
  }
}
