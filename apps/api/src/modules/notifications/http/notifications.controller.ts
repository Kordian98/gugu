import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  bookingMessagesSchema,
  bookingParamsSchema,
  type BookingMessages,
  type Inbox,
  type InboxQuery,
  inboxQuerySchema,
  type InboxReadInput,
  inboxReadInputSchema,
  inboxSchema,
  type MemberNotificationPrefs,
  memberNotificationPrefsSchema,
  type NotificationSettings,
  type NotificationSettingsInput,
  notificationSettingsInputSchema,
  notificationSettingsSchema,
  problemSchema,
  salonParamsSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { InboxService } from "../application/inbox.service";
import { NotificationSettingsService } from "../application/settings.service";
import { TimelineQueries } from "../application/timeline.queries";
import { NOTIFICATIONS_READ_MODELS } from "../notifications.read-models";

type SalonParams = { salonId: string };
type BookingParams = { salonId: string; bookingId: string };

/**
 * Salon panel endpoints of the notifications module (topic 11): Settings → Notifications, the
 * per-booking "messages sent" timeline and the member's own bell. No customer-facing routes (X23).
 */
@ApiTags("notifications")
@Controller("salons/:salonId")
export class NotificationsController {
  constructor(
    private readonly settings: NotificationSettingsService,
    private readonly inbox: InboxService,
    private readonly timeline: TimelineQueries,
  ) {}

  @Get("notifications/settings")
  @RequirePermission("salon.read")
  @ApiOperation({
    operationId: "notifications.settings",
    summary: "Notification settings: events on/off per channel, reminder offsets, reply-to.",
  })
  @ApiResponse({
    status: 200,
    description: "Settings.",
    standardSchema: notificationSettingsSchema,
  })
  getSettings(@Param({ schema: salonParamsSchema }) p: SalonParams): Promise<NotificationSettings> {
    return this.settings.get(p.salonId);
  }

  @Put("notifications/settings")
  @RequirePermission("salon.settings.write")
  @ApiOperation({
    operationId: "notifications.updateSettings",
    summary: "Update notification settings (audited; re-plans pending reminders).",
  })
  @ApiResponse({ status: 200, description: "Saved.", standardSchema: notificationSettingsSchema })
  @ApiResponse({ status: 400, description: "Invalid input.", standardSchema: problemSchema })
  updateSettings(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Body({ schema: notificationSettingsInputSchema }) body: NotificationSettingsInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<NotificationSettings> {
    return this.settings.update(salon, user.userId, body);
  }

  @Get("bookings/:bookingId/messages")
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "notifications.bookingLog",
    summary: NOTIFICATIONS_READ_MODELS["notifications.bookingLog"].description,
  })
  @ApiResponse({ status: 200, description: "Timeline.", standardSchema: bookingMessagesSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  bookingLog(
    @Param({ schema: bookingParamsSchema }) p: BookingParams,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<BookingMessages> {
    return this.timeline.forBooking(salon, user.userId, p.bookingId);
  }

  @Get("notifications/inbox")
  @RequirePermission("salon.read")
  @ApiOperation({ operationId: "notifications.inbox", summary: "The signed-in member's bell." })
  @ApiResponse({ status: 200, description: "Inbox.", standardSchema: inboxSchema })
  list(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Query({ schema: inboxQuerySchema }) q: InboxQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<Inbox> {
    return this.inbox.list(salon, user.userId, q);
  }

  @Post("notifications/inbox/read")
  @RequirePermission("salon.read")
  @HttpCode(204)
  @ApiOperation({ operationId: "notifications.markRead", summary: "Mark own bell items read." })
  @ApiResponse({ status: 204, description: "Done." })
  async markRead(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @Body({ schema: inboxReadInputSchema }) body: InboxReadInput,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.inbox.markRead(p.salonId, user.userId, body.ids);
  }

  @Get("notifications/me")
  @RequirePermission("salon.read")
  @ApiOperation({ operationId: "notifications.myPrefs", summary: "Own email copy on/off." })
  @ApiResponse({
    status: 200,
    description: "Prefs.",
    standardSchema: memberNotificationPrefsSchema,
  })
  myPrefs(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @CurrentUser() user: UserPrincipal,
  ): Promise<MemberNotificationPrefs> {
    return this.inbox.prefs(p.salonId, user.userId);
  }

  @Put("notifications/me")
  @RequirePermission("salon.read")
  @ApiOperation({ operationId: "notifications.setMyPrefs", summary: "Turn own email copy on/off." })
  @ApiResponse({
    status: 200,
    description: "Prefs.",
    standardSchema: memberNotificationPrefsSchema,
  })
  setMyPrefs(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @Body({ schema: memberNotificationPrefsSchema }) body: MemberNotificationPrefs,
    @CurrentUser() user: UserPrincipal,
  ): Promise<MemberNotificationPrefs> {
    return this.inbox.setPrefs(p.salonId, user.userId, body);
  }
}
