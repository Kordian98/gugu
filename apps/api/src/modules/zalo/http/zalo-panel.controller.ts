import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  cursorQuerySchema,
  problemSchema,
  salonParamsSchema,
  uuidV7Schema,
  type ZaloAttention,
  type ZaloStats,
  type ZaloStatsQuery,
  zaloStatsQuerySchema,
  zaloStatsSchema,
  zaloAttentionSchema,
  type ZaloConnection,
  zaloConnectionSchema,
  type ZaloConversation,
  zaloConversationSchema,
  type ZaloConversationList,
  zaloConversationListQuerySchema,
  zaloConversationListSchema,
  type ZaloMessageList,
  zaloMessageListSchema,
  type ZaloNotificationList,
  zaloNotificationListSchema,
  type ZaloSendLog,
  zaloSendLogSchema,
  type ZaloSendMessageInput,
  zaloSendMessageInputSchema,
  type ZaloSettingsInput,
  zaloSettingsInputSchema,
  type ZaloStartConnectionResult,
  zaloStartConnectionResultSchema,
  zaloStartConnectionSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { RequiresEntitlement } from "../../subscriptions/subscriptions.facade";
import { ConnectionService } from "../application/connection.service";
import { InboxService } from "../application/inbox.service";
import { StatsQueries } from "../application/stats.queries";
import { ZALO_READ_MODELS } from "../zalo.read-models";
import { RequiresInboxRead } from "./inbox-read.guard";

const conversationParams = z.object({ salonId: uuidV7Schema, conversationId: uuidV7Schema });
type ConversationParams = z.infer<typeof conversationParams>;
type SalonParams = { salonId: string };

/**
 * Settings → Zalo (owner) and the Zalo inbox (owner, manager, receptionist). Topic 09 / X24.
 * Customers never reach these routes; they only talk to the salon's OA inside Zalo.
 */
@ApiTags("zalo")
@Controller("salons/:salonId/zalo")
export class ZaloPanelController {
  constructor(
    private readonly connections: ConnectionService,
    private readonly inbox: InboxService,
    private readonly statsQueries: StatsQueries,
  ) {}

  @Get("connection")
  @RequirePermission("zalo.inbox.use")
  @ApiOperation({
    operationId: "zalo.connection",
    summary: "Zalo OA connection, settings and this month's usage.",
  })
  @ApiResponse({ status: 200, description: "Connection.", standardSchema: zaloConnectionSchema })
  connection(@Param({ schema: salonParamsSchema }) p: SalonParams): Promise<ZaloConnection> {
    return this.connections.status(p.salonId);
  }

  @Post("connection/start")
  @RequirePermission("integrations.zalo.manage")
  @RequiresEntitlement("zalo.oa_connect")
  @HttpCode(200)
  @ApiOperation({
    operationId: "zalo.startConnection",
    summary: "Start connecting the salon's Zalo OA (OAuth + PKCE).",
  })
  @ApiResponse({
    status: 200,
    description: "Open this URL.",
    standardSchema: zaloStartConnectionResultSchema,
  })
  @ApiResponse({ status: 503, description: "Zalo disabled.", standardSchema: problemSchema })
  start(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @Body({ schema: zaloStartConnectionSchema })
    body: { locale: "vi" | "en"; returnTo: "settings" | "setup" },
    @CurrentUser() user: UserPrincipal,
  ): Promise<ZaloStartConnectionResult> {
    return this.connections.start(p.salonId, user.userId, body.locale, body.returnTo);
  }

  @Post("connection/disconnect")
  @RequirePermission("integrations.zalo.manage")
  @HttpCode(204)
  @ApiOperation({
    operationId: "zalo.disconnect",
    summary: "Disconnect the OA: tokens are deleted and all Zalo messaging stops.",
  })
  @ApiResponse({ status: 404, description: "Not connected.", standardSchema: problemSchema })
  async disconnect(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.connections.disconnect(p.salonId, user.userId);
  }

  @Patch("settings")
  @RequirePermission("integrations.zalo.manage")
  @HttpCode(204)
  @ApiOperation({
    operationId: "zalo.updateSettings",
    summary: "Bot, reminders, paid messages, template ids, monthly cap.",
  })
  async settings(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @Body({ schema: zaloSettingsInputSchema }) body: ZaloSettingsInput,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.connections.updateSettings(p.salonId, user.userId, body);
  }

  @Get("conversations")
  @RequirePermission("zalo.inbox.use")
  @RequiresInboxRead()
  @ApiOperation({ operationId: "zalo.conversations", summary: "Zalo conversations, newest first." })
  @ApiResponse({ status: 200, description: "Page.", standardSchema: zaloConversationListSchema })
  conversations(
    @Param({ schema: salonParamsSchema }) _p: SalonParams,
    @Query({ schema: zaloConversationListQuerySchema })
    query: { cursor?: string; limit: number; filter: "all" | "needs_staff" | "unread" },
    @CurrentSalon() salon: SalonContext,
  ): Promise<ZaloConversationList> {
    return this.inbox.conversations(salon, query);
  }

  @Get("conversations/:conversationId")
  @RequirePermission("zalo.inbox.use")
  @RequiresInboxRead()
  @ApiOperation({ operationId: "zalo.conversation", summary: "One Zalo conversation." })
  @ApiResponse({
    status: 200,
    description: "Conversation.",
    standardSchema: zaloConversationSchema,
  })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  conversation(
    @Param({ schema: conversationParams }) p: ConversationParams,
    @CurrentSalon() salon: SalonContext,
  ): Promise<ZaloConversation> {
    return this.inbox.conversationDetail(salon, p.conversationId);
  }

  @Get("conversations/:conversationId/messages")
  @RequirePermission("zalo.inbox.use")
  @RequiresInboxRead()
  @ApiOperation({
    operationId: "zalo.messages",
    summary: "Messages of a conversation (oldest first within a page).",
  })
  @ApiResponse({ status: 200, description: "Page.", standardSchema: zaloMessageListSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  messages(
    @Param({ schema: conversationParams }) p: ConversationParams,
    @Query({ schema: cursorQuerySchema }) query: { cursor?: string; limit: number },
  ): Promise<ZaloMessageList> {
    return this.inbox.messages(p.salonId, p.conversationId, query);
  }

  @Post("conversations/:conversationId/messages")
  @RequirePermission("zalo.inbox.use")
  @RequiresEntitlement("zalo.inbox")
  @HttpCode(202)
  @ApiOperation({
    operationId: "zalo.reply",
    summary: "Reply as the salon (takes the chat over from the bot).",
  })
  @ApiResponse({
    status: 422,
    description: "Outside the send window.",
    standardSchema: problemSchema,
  })
  async reply(
    @Param({ schema: conversationParams }) p: ConversationParams,
    @Body({ schema: zaloSendMessageInputSchema }) body: ZaloSendMessageInput,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<void> {
    await this.inbox.reply(salon, user.userId, p.conversationId, body.text);
  }

  @Post("conversations/:conversationId/take-over")
  @RequirePermission("zalo.inbox.use")
  @HttpCode(204)
  @ApiOperation({
    operationId: "zalo.takeOver",
    summary: "Staff takes over; the bot stays silent.",
  })
  async takeOver(
    @Param({ schema: conversationParams }) p: ConversationParams,
    @CurrentUser() user: UserPrincipal,
  ) {
    await this.inbox.takeOver(p.salonId, user.userId, p.conversationId);
  }

  @Post("conversations/:conversationId/release")
  @RequirePermission("zalo.inbox.use")
  @HttpCode(204)
  @ApiOperation({ operationId: "zalo.release", summary: "Hand the conversation back to the bot." })
  async release(
    @Param({ schema: conversationParams }) p: ConversationParams,
    @CurrentUser() user: UserPrincipal,
  ) {
    await this.inbox.release(p.salonId, user.userId, p.conversationId);
  }

  @Post("conversations/:conversationId/read")
  @RequirePermission("zalo.inbox.use")
  @HttpCode(204)
  @ApiOperation({ operationId: "zalo.markRead", summary: "Mark a conversation read." })
  async read(@Param({ schema: conversationParams }) p: ConversationParams) {
    await this.inbox.markRead(p.salonId, p.conversationId);
  }

  @Get("stats")
  @RequirePermission("analytics.read")
  @ApiOperation({ operationId: "zalo.stats", summary: ZALO_READ_MODELS["zalo.stats"].description })
  @ApiResponse({
    status: 200,
    description: "Aggregates for the period.",
    standardSchema: zaloStatsSchema,
  })
  stats(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @Query({ schema: zaloStatsQuerySchema }) query: ZaloStatsQuery,
  ): Promise<ZaloStats> {
    return this.statsQueries.stats(p.salonId, query);
  }

  @Get("attention")
  @RequirePermission("zalo.inbox.use")
  @ApiOperation({
    operationId: "zalo.attention",
    summary: "Customers waiting for a staff member (badge, Today card, pinned inbox).",
  })
  @ApiResponse({ status: 200, description: "Waiting chats.", standardSchema: zaloAttentionSchema })
  attention(@Param({ schema: salonParamsSchema }) p: SalonParams): Promise<ZaloAttention> {
    return this.inbox.attention(p.salonId);
  }

  @Get("notifications")
  @RequirePermission("zalo.inbox.use")
  @ApiOperation({
    operationId: "zalo.notifications",
    summary: "Hand-off requests and bot booking changes.",
  })
  @ApiResponse({
    status: 200,
    description: "Latest 50.",
    standardSchema: zaloNotificationListSchema,
  })
  notifications(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
  ): Promise<ZaloNotificationList> {
    return this.inbox.notifications(p.salonId);
  }

  @Post("notifications/read")
  @RequirePermission("zalo.inbox.use")
  @HttpCode(204)
  @ApiOperation({ operationId: "zalo.notificationsRead", summary: "Mark all notifications read." })
  async notificationsRead(@Param({ schema: salonParamsSchema }) p: SalonParams) {
    await this.inbox.markNotificationsRead(p.salonId);
  }

  @Get("send-log")
  @RequirePermission("integrations.zalo.manage")
  @ApiOperation({
    operationId: "zalo.sendLog",
    summary: "Every Zalo send with status, tier and estimated cost.",
  })
  @ApiResponse({ status: 200, description: "Page.", standardSchema: zaloSendLogSchema })
  sendLog(
    @Param({ schema: salonParamsSchema }) p: SalonParams,
    @Query({ schema: cursorQuerySchema }) query: { cursor?: string; limit: number },
  ): Promise<ZaloSendLog> {
    return this.inbox.sendLog(p.salonId, query);
  }
}
