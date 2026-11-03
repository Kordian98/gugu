import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type CustomerNotificationEvent,
  isTeamEvent,
  type Locale,
  type NotificationEvent,
  type TeamNotificationEvent,
} from "@gugu/contracts";
import { createI18n } from "@gugu/localization";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { mailAddressOf } from "../../../infrastructure/mail/mail.service";
import type { NotificationDelivery } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { MembershipService } from "../../authorization/authorization.facade";
import { ZaloDeliveryQueries } from "../../zalo/zalo.facade";
import {
  type ChannelProvider,
  type EmailMessage,
  PermanentChannelError,
} from "../channels/channel";
import { CATALOG, channelEnabled, customerDef, teamDef } from "../domain/catalog";
import { buildIcs } from "../domain/ics";
import { coveringZaloReminder } from "../domain/reminders";
import { customerSkipReason, zaloGate } from "../domain/send-checks";
import { renderCustomerEmail, renderTeamEmail } from "../templates/email-templates";
import {
  type BookingView,
  formatAddress,
  formatPrice,
  formatWhen,
  loadBookingView,
  serviceName,
} from "./booking-view";
import { NotifyClock } from "./notify-clock";
import { RecipientsService } from "./recipients.service";
import { NotificationSettingsService } from "./settings.service";

/** Send lease: long enough for one SMTP round trip, short enough that a crash recovers quickly. */
const LEASE_MS = 120_000;
/** Re-check Zalo every minute; after this long without a final Zalo result, email anyway. */
export const ZALO_RECHECK_MS = 60_000;
export const ZALO_WAIT_MAX_MS = 15 * 60_000;
/** A job that runs this much before its planned time is put back (e.g. re-enqueued early). */
const EARLY_TOLERANCE_MS = 5_000;

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export type SendResult =
  | { kind: "noop" }
  | { kind: "sent" }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "deferred"; until: Date };

type Decision =
  | { kind: "skip"; reason: string }
  | { kind: "defer"; until: Date }
  | { kind: "send"; message: EmailMessage; fallback: boolean };

/** E.164 Vietnamese number → national format for display (`+84901234567` → `0901 234 567`). */
export function displayPhone(e164: string | null): string | null {
  if (!e164) return null;
  if (!e164.startsWith("+84")) return e164;
  const n = `0${e164.slice(3)}`;
  return n.length === 10 ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : n;
}

/**
 * `notify.send` worker logic. Claims the delivery with a lease (a duplicate job or a second worker
 * gets `noop`), re-checks everything at send time (booking state and version for reminders,
 * settings, recipient access, what Zalo already delivered), renders, sends through the channel
 * provider and records status, provider id, units and estimated cost. Throws only for retryable
 * provider errors (BullMQ backs off); the final attempt records `failed` instead.
 */
@Injectable()
export class SenderService {
  private readonly logger = new Logger(SenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NotificationSettingsService,
    private readonly recipients: RecipientsService,
    private readonly membership: MembershipService,
    private readonly zalo: ZaloDeliveryQueries,
    private readonly config: AppConfig,
    private readonly clock: NotifyClock,
    @Inject(EMAIL_PROVIDER) private readonly email: ChannelProvider<EmailMessage>,
  ) {}

  async send(deliveryId: string, finalAttempt: boolean): Promise<SendResult> {
    const now = this.clock.now();
    const d = await this.prisma.notificationDelivery.findUnique({ where: { id: deliveryId } });
    if (!d || (d.status !== "queued" && d.status !== "scheduled") || d.channel !== "email") {
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
      decision = await this.decide(d, now);
    } catch (error) {
      await this.release(d.id);
      throw error;
    }
    if (decision.kind === "skip") {
      await this.finish(d.id, { status: "skipped", reason: decision.reason });
      return { kind: "skipped", reason: decision.reason };
    }
    if (decision.kind === "defer") {
      await this.release(d.id, { fallbackOf: "zalo_template" });
      return { kind: "deferred", until: decision.until };
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
        ...(decision.fallback ? { fallbackOf: "zalo_template" } : {}),
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
        | "status"
        | "reason"
        | "providerMessageId"
        | "sentAt"
        | "units"
        | "costEstimateVnd"
        | "fallbackOf"
      >
    >,
  ) {
    // Only the lease holder's row: a reminder superseded mid-send stays `skipped`.
    await this.prisma.notificationDelivery.updateMany({
      where: { id, status: "queued" },
      data: { ...data, lockedUntil: null },
    });
  }

  private async release(id: string, data: { fallbackOf?: string } = {}) {
    await this.prisma.notificationDelivery.updateMany({
      where: { id, status: "queued" },
      data: { ...data, lockedUntil: null },
    });
  }

  private async decide(d: NotificationDelivery, now: Date): Promise<Decision> {
    const event = d.event as NotificationEvent;
    if (!(event in CATALOG)) return { kind: "skip", reason: "other" };
    const settings = await this.settings.stored(d.salonId);
    if (!channelEnabled(settings.events, event, "email"))
      return { kind: "skip", reason: "disabled" };
    return isTeamEvent(event)
      ? this.decideTeam(d, event)
      : this.decideCustomer(d, event, settings.replyToEmail, now);
  }

  private async decideCustomer(
    d: NotificationDelivery,
    event: CustomerNotificationEvent,
    replyTo: string | null,
    now: Date,
  ): Promise<Decision> {
    if (!d.bookingId) return { kind: "skip", reason: "stale" };
    const b = await loadBookingView(this.prisma, d.salonId, d.bookingId);
    if (!b) return { kind: "skip", reason: "stale" };
    if (!b.customerEmail || b.customerAnonymisedAt || b.customerName === null) {
      return { kind: "skip", reason: "no_contact" };
    }
    if (await this.overCap(d.salonId, b.customerEmail, now)) return { kind: "skip", reason: "cap" };
    const meta = (d.meta ?? {}) as {
      startsAt?: string;
      offsetMinutes?: number;
      zaloDedupKey?: string;
    };
    const skip = customerSkipReason(
      event,
      b,
      { entityVersion: d.entityVersion, plannedStartsAt: meta.startsAt },
      now,
    );
    if (skip) return { kind: "skip", reason: skip };
    const gateKey = await this.zaloKey(d, event, b, meta);
    let fallback = false;
    if (gateKey) {
      const since = event === "booking.reminder" ? (d.scheduledFor ?? d.createdAt) : d.createdAt;
      const gate = zaloGate(await this.zalo.outcome(d.salonId, gateKey), since, now, {
        recheckMs: ZALO_RECHECK_MS,
        maxWaitMs: ZALO_WAIT_MAX_MS,
      });
      if (gate.kind === "skip") return { kind: "skip", reason: "sent_via_zalo" };
      if (gate.kind === "wait") return { kind: "defer", until: gate.until };
      fallback = true;
    }
    return {
      kind: "send",
      fallback,
      message: this.customerMessage(d, event, b, replyTo, now),
    };
  }

  /**
   * Abuse caps (security review): the customer address is typed by staff and never verified, so a
   * salon member could script bookings to email arbitrary people in the salon's name from our
   * domain. Customer emails are capped per salon and per address per 24 h; hits are logged as
   * `skipped/cap`. The address itself is never stored in the log (it is joined from the booking).
   */
  private async overCap(salonId: string, email: string, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - 86_400_000);
    const perSalon = await this.prisma.notificationDelivery.count({
      where: { salonId, audience: "customer", status: "sent", sentAt: { gt: since } },
    });
    if (perSalon >= this.config.env.NOTIFY_CUSTOMER_EMAILS_PER_SALON_DAY) return true;
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n
      FROM notification_deliveries d
      JOIN bookings b ON b.id = d.booking_id AND b.salon_id = d.salon_id
      WHERE d.salon_id = ${salonId}::uuid AND d.audience = 'customer' AND d.status = 'sent'
        AND d.sent_at > ${since} AND b.customer_email = ${email}::citext`;
    return Number(row?.n ?? 0) >= this.config.env.NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY;
  }

  /**
   * Zalo send this email is the fallback of: the booking update for confirmations, reschedules and
   * cancellations (planned with a Zalo route), or the covering Zalo reminder (24 h / 2 h) when the
   * customer has a usable Zalo route now. Null = email is the only channel.
   */
  private async zaloKey(
    d: NotificationDelivery,
    event: CustomerNotificationEvent,
    b: BookingView,
    meta: { offsetMinutes?: number; zaloDedupKey?: string },
  ): Promise<string | null> {
    if (event !== "booking.reminder") {
      return d.fallbackOf === "zalo_template" ? (meta.zaloDedupKey ?? null) : null;
    }
    if (typeof meta.offsetMinutes !== "number") return null;
    const route = await this.zalo.route(d.salonId, b.id);
    const kind = route.usable ? coveringZaloReminder(meta.offsetMinutes, b, route) : null;
    return kind ? `${kind}:${b.id}` : null;
  }

  private customerMessage(
    d: NotificationDelivery,
    event: CustomerNotificationEvent,
    b: BookingView,
    replyTo: string | null,
    now: Date,
  ): EmailMessage {
    // Recipient locale → salon default → vi (customers have no account, so: salon default).
    const locale: Locale = b.salon.defaultLocale;
    const tz = b.salon.timezone;
    const service = serviceName(b, locale);
    const address = formatAddress(b, locale);
    const rendered = renderCustomerEmail(event, locale, {
      salon: b.salon.name,
      customerName: b.customerName,
      service,
      when: formatWhen(b.startsAt, locale, tz),
      staff: b.staff.displayName,
      code: b.referenceCode,
      price: formatPrice(b, locale),
      address,
      phone: displayPhone(b.salon.phoneE164),
      canReply: replyTo !== null,
    });
    const domain = mailAddressOf(this.config.env.MAIL_FROM).split("@")[1] ?? "localhost";
    const method = customerDef(event).ics;
    const ics = buildIcs({
      method,
      bookingId: b.id,
      version: b.version,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      summary: createI18n(locale).t("notifications:ics.summary", { service, salon: b.salon.name }),
      location: address,
      uidDomain: domain,
      now,
    });
    return {
      to: b.customerEmail ?? "",
      ...rendered,
      fromName: b.salon.name,
      replyTo,
      attachments: [
        {
          filename: "appointment.ics",
          content: ics,
          contentType: `text/calendar; charset=utf-8; method=${method === "cancel" ? "CANCEL" : "PUBLISH"}`,
        },
      ],
      messageId: `${d.idempotencyKey}@${domain}`,
    };
  }

  private async decideTeam(
    d: NotificationDelivery,
    event: TeamNotificationEvent,
  ): Promise<Decision> {
    if (!d.recipientUserId) return { kind: "skip", reason: "other" };
    const def = teamDef(event);
    const b = d.bookingId ? await loadBookingView(this.prisma, d.salonId, d.bookingId) : null;
    if (d.bookingId && !b) return { kind: "skip", reason: "stale" };
    // Access is re-checked at send time: a removed member or a reassigned booking gets nothing.
    const ctx = await this.membership.resolve(d.recipientUserId, d.salonId);
    if (
      !(await this.recipients.allowed(ctx, d.recipientUserId, def.permission, b ? [b.staffId] : []))
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
    if (!user?.email || !user.emailVerifiedAt || !salon)
      return { kind: "skip", reason: "no_email" };
    const locale: Locale = user.preferredLocale;
    const web = this.config.env.WEB_APP_URL.replace(/\/$/, "");
    const link = `${web}/${locale}/business/${def.link === "zalo" ? "zalo" : "calendar"}`;
    const rendered = renderTeamEmail(event, locale, {
      salon: salon.name,
      code: b?.referenceCode ?? null,
      when: b ? formatWhen(b.startsAt, locale, salon.timezone) : null,
      service: b ? serviceName(b, locale) || null : null,
      staff: b?.staff.displayName ?? null,
      customer: b && !b.customerAnonymisedAt ? b.customerName : null,
      link,
    });
    const domain = mailAddressOf(this.config.env.MAIL_FROM).split("@")[1] ?? "localhost";
    return {
      kind: "send",
      fallback: false,
      message: {
        to: user.email,
        ...rendered,
        fromName: "GuGu Studio",
        replyTo: null,
        attachments: [],
        messageId: `${d.idempotencyKey}@${domain}`,
      },
    };
  }
}
