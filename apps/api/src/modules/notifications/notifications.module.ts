import { Module } from "@nestjs/common";
import { MailModule } from "../../infrastructure/mail/mail.module";
import { AuditModule } from "../audit/audit.facade";
import { MembershipService } from "../authorization/authorization.facade";
import { ZaloModule, ZaloWorkerModule } from "../zalo/zalo.facade";
import { DeliveryQueue } from "./application/delivery-queue";
import { InboxService } from "./application/inbox.service";
import { NotificationEventsHandler } from "./application/notification-events.handler";
import { NotifyClock } from "./application/notify-clock";
import { NotifyJobs } from "./application/notify-jobs";
import { PlannerService } from "./application/planner.service";
import { RecipientsService } from "./application/recipients.service";
import { RemindersService } from "./application/reminders.service";
import { EMAIL_PROVIDER, SenderService } from "./application/sender.service";
import { NotificationSettingsService } from "./application/settings.service";
import { TimelineQueries } from "./application/timeline.queries";
import { EmailChannel } from "./channels/channel";
import { NotificationsController } from "./http/notifications.controller";

/**
 * Notifications (topic 11, email milestone): Settings → Notifications, per-booking message
 * timeline and the team bell (HTTP). Planning and sending run in the worker
 * (NotificationsWorkerModule). Domain doc: docs/domains/customer-notifications.md.
 */
@Module({
  imports: [AuditModule, ZaloModule],
  controllers: [NotificationsController],
  providers: [
    NotifyClock,
    NotificationSettingsService,
    RecipientsService,
    InboxService,
    TimelineQueries,
  ],
})
export class NotificationsModule {}

/** Worker slice: outbox consumer (planner), `notify` queue sends, reminders, reconciliation. */
@Module({
  // The HTTP app has these globally; the worker process imports them here.
  imports: [AuditModule, MailModule, ZaloWorkerModule],
  providers: [
    MembershipService,
    NotifyClock,
    NotificationSettingsService,
    RecipientsService,
    DeliveryQueue,
    RemindersService,
    PlannerService,
    SenderService,
    EmailChannel,
    { provide: EMAIL_PROVIDER, useExisting: EmailChannel },
    NotificationEventsHandler,
    NotifyJobs,
  ],
  exports: [NotificationEventsHandler, NotifyJobs],
})
export class NotificationsWorkerModule {}
