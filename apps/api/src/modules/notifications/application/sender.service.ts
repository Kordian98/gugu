import { Inject, Injectable, Logger } from "@nestjs/common";
import { isTeamEvent, type Locale, type NotificationEvent } from "@gugu/contracts";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { mailAddressOf } from "../../../infrastructure/mail/mail.service";
import type { NotificationDelivery } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { MembershipService } from "../../authorization/authorization.facade";
import {
  type ChannelProvider,
  type EmailMessage,
  PermanentChannelError,
} from "../channels/channel";
import { channelEnabled, teamDef } from "../domain/catalog";
import { renderTeamEmail } from "../templates/email-templates";
import {
  bookingStaffIds,
  formatWhen,
  loadBookingView,
  serviceName,
  staffNames,
} from "./booking-view";
import { NotifyClock } from "./notify-clock";
import { RecipientsService } from "./recipients.service";
import { NotificationSettingsService } from "./settings.service";

/** Send lease: long enough for one SMTP round trip, short enough that a crash recovers quickly. */
const LEASE_MS = 120_000;
/** A job that runs this much before its planned time is put back (e.g. re-enqueued early). */
const EARLY_TOLERANCE_MS = 5_000;

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export type SendResult =
  | { kind: "noop" }
  | { kind: "sent" }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "deferred"; until: Date };

type Decision = { kind: "skip"; reason: string } | { kind: "send"; message: EmailMessage };

/**
 * `notify.send` worker logic — team emails only. GuGu never emails a salon's customers (X26): a
 * delivery that is not a team email of a team event is a `noop` (the DB check constraint already
 * rejects customer rows). Claims the delivery with a lease (a duplicate job or a second worker
 * gets `noop`), re-checks settings, the member's access and own preference at send time, renders,
 * sends through the channel provider and records status, provider id, units and estimated cost.
 * Throws only for retryable provider errors (BullMQ backs off); the final attempt records `failed`.
 */
@Injectable()
export class SenderService {
  private readonly logger = new Logger(SenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NotificationSettingsService,
    private readonly recipients: RecipientsService,
    private readonly membership: MembershipService,
    private readonly config: AppConfig,
    private readonly clock: NotifyClock,
    @Inject(EMAIL_PROVIDER) private readonly email: ChannelProvider<EmailMessage>,
  ) {}

  async send(deliveryId: string, finalAttempt: boolean): Promise<SendResult> {
    const now = this.clock.now();
    const d = await this.prisma.notificationDelivery.findUnique({ where: { id: deliveryId } });
    if (
      !d ||
      (d.status !== "queued" && d.status !== "scheduled") ||
      d.channel !== "email" ||
      d.audience !== "team" ||
      !isTeamEvent(d.event as NotificationEvent)
    ) {
      return { kind: "noop" };
    }
    if (d.scheduledFor && d.scheduledFor.getTime() > now.getTime() + EARLY_TOLERANCE_MS) {
      return { kind: "deferred", until: d.scheduledFor };
    }
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: d.id,
        status: { in: ["queued", "scheduled"] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: {
        status: "queued",
        lockedUntil: new Date(now.getTime() + LEASE_MS),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return { kind: "noop" };

    let decision: Decision;
    try {
      decision = await this.decide(d);
    } catch (error) {
      await this.release(d.id);
      throw error;
    }
    if (decision.kind === "skip") {
      await this.finish(d.id, { status: "skipped", reason: decision.reason });
      return { kind: "skipped", reason: decision.reason };
    }
    try {
      const { providerMessageId } = await this.email.send(decision.message);
      await this.finish(d.id, {
        status: "sent",
        reason: null,
        providerMessageId,
        sentAt: this.clock.now(),
        units: 1,
        costEstimateVnd: this.config.env.NOTIFY_EMAIL_COST_VND,
      });
      return { kind: "sent" };
    } catch (error) {
      const permanent = error instanceof PermanentChannelError;
      if (permanent || finalAttempt) {
        const reason = permanent ? error.code : "provider_error";
        await this.finish(d.id, { status: "failed", reason });
        this.logger.warn({ deliveryId: d.id, reason }, "notification email failed");
        return { kind: "failed", reason };
      }
      await this.release(d.id);
      throw error;
    }
  }

  private async finish(
    id: string,
    data: Partial<
      Pick<
        NotificationDelivery,
        "status" | "reason" | "providerMessageId" | "sentAt" | "units" | "costEstimateVnd"
      >
    >,
  ) {
    // Only the lease holder's row.
    await this.prisma.notificationDelivery.updateMany({
      where: { id, status: "queued" },
      data: { ...data, lockedUntil: null },
    });
  }

  /** Back to the queue for a retry. */
  private async release(id: string) {
    await this.prisma.notificationDelivery.updateMany({
      where: { id, status: "queued" },
      data: { lockedUntil: null },
    });
  }

  private async decide(d: NotificationDelivery): Promise<Decision> {
    const event = d.event as NotificationEvent;
    if (!isTeamEvent(event) || !d.recipientUserId) return { kind: "skip", reason: "other" };
    const settings = await this.settings.stored(d.salonId);
    if (!channelEnabled(settings.events, event, "email")) {
      return { kind: "skip", reason: "disabled" };
    }
    const def = teamDef(event);
    const b = d.bookingId ? await loadBookingView(this.prisma, d.salonId, d.bookingId) : null;
    if (d.bookingId && !b) return { kind: "skip", reason: "stale" };
    // Access is re-checked at send time: a removed member or a reassigned booking gets nothing.
    const ctx = await this.membership.resolve(d.recipientUserId, d.salonId);
    if (
      !(await this.recipients.allowed(
        ctx,
        d.recipientUserId,
        def.permission,
        b ? bookingStaffIds(b) : [],
      ))
    ) {
      return { kind: "skip", reason: "not_member" };
    }
    const [user, pref, salon] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: d.recipientUserId, status: "active", deletedAt: null },
        select: { email: true, emailVerifiedAt: true, preferredLocale: true },
      }),
      this.prisma.notificationMemberPref.findUnique({
        where: { salonId_userId: { salonId: d.salonId, userId: d.recipientUserId } },
      }),
      this.prisma.salon.findFirst({
        where: { id: d.salonId },
        select: { name: true, timezone: true },
      }),
    ]);
    if (pref && !pref.emailEnabled) return { kind: "skip", reason: "muted" };
    if (!user?.email || !user.emailVerifiedAt || !salon) {
      return { kind: "skip", reason: "no_email" };
    }
    const locale: Locale = user.preferredLocale;
    const web = this.config.env.WEB_APP_URL.replace(/\/$/, "");
    const link = `${web}/${locale}/business/${def.link === "zalo" ? "zalo" : "calendar"}`;
    const rendered = renderTeamEmail(event, locale, {
      salon: salon.name,
      code: b?.referenceCode ?? null,
      when: b ? formatWhen(b.startsAt, locale, salon.timezone) : null,
      service: b ? serviceName(b, locale) || null : null,
      staff: b ? staffNames(b) : null,
      customer: b && !b.customerAnonymisedAt ? b.customerName : null,
      link,
    });
    const domain = mailAddressOf(this.config.env.MAIL_FROM).split("@")[1] ?? "localhost";
    return {
      kind: "send",
      message: {
        to: user.email,
        ...rendered,
        fromName: "GuGu Studio",
        messageId: `${d.idempotencyKey}@${domain}`,
      },
    };
  }
}
