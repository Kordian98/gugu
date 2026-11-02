import { Module } from "@nestjs/common";
import { InvitationService } from "./application/invitation.service";
import { TeamService } from "./application/team.service";
import { TeamController } from "./http/team.controller";

/** Team, schedules, breaks, time off and the minimal staff invitation flow (07 M7.4). */
@Module({
  controllers: [TeamController],
  providers: [TeamService, InvitationService],
})
export class TeamModule {}
