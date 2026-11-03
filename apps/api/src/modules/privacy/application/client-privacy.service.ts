import { Injectable } from "@nestjs/common";
import {
  CUSTOMER_ERRORS,
  type ClientEraseResult,
  type ClientExportResult,
  type Locale,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { BookingAnonymiser } from "../../bookings/bookings.facade";
import { renderClientExportText } from "../domain/render-export";
import { buildClientExport, loadClientScope } from "./client-data";

/**
 * One client's privacy requests, answered by the salon owner (q80): export (JSON + readable text)
 * and erasure. Customers never authenticate (X23); the salon is the one that holds the record.
 * Every call is scoped by the server-resolved SalonContext and audited without personal data.
 *
 * Erasure touches tables of other modules on purpose (this is the one place that removes a person
 * everywhere): customer_salon_profiles + customer_notes (07), bookings / offline_sales /
 * booking_status_history via BookingAnonymiser (06), zalo_* (09). The client's optional email
 * (q87) lives on the profile and goes with it; notification_deliveries (11) hold team rows only.
 * Assistant entity tokens (08) hold only staff/service/booking ids — no client data — and are kept
 * so existing conversations stay consistent; booking tokens re-hydrate to the reference code only.
 */
@Injectable()
export class ClientPrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bookings: BookingAnonymiser,
  ) {}

  async export(ctx: SalonContext, profileId: string, locale: Locale): Promise<ClientExportResult> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const scope = await loadClientScope(tx, ctx.salonId, profileId);
      if (!scope) throw notFound();
      const salon = await tx.salon.findUniqueOrThrow({
        where: { id: ctx.salonId },
        select: { id: true, name: true, timezone: true },
      });
      const json = await buildClientExport(tx, { id: salon.id, name: salon.name }, scope, now);
      await this.audit.record(
        {
          action: "privacy.client_exported",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "customer_salon_profile",
          targetId: profileId,
          metadata: {
            bookings: json.bookings.length,
            notes: json.notes.length,
            zaloConversations: json.zalo.length,
          },
        },
        tx,
      );
      return { json, tz: salon.timezone };
    });
    return {
      fileBaseName: `gugu-client-${profileId.slice(-8)}-${now.toISOString().slice(0, 10)}`,
      json: result.json,
      text: renderClientExportText(result.json, locale, result.tz),
    };
  }

  /**
   * Irreversible. One transaction removes the person: profile(s) and notes deleted, bookings
   * anonymised (kept for the salon's history), Zalo chat content deleted and the conversation
   * stripped of name/phone/bot state, raw Zalo events of that user deleted, profile with its stored
   * email gone. Upcoming bookings are cancelled after commit
   * (their contact is already gone, so no customer message can go out).
   */
  async erase(ctx: SalonContext, profileId: string): Promise<ClientEraseResult> {
    const done = await this.prisma.$transaction(async (tx) => {
      const scope = await loadClientScope(tx, ctx.salonId, profileId);
      if (!scope) throw notFound();
      const salonId = ctx.salonId;
      const conversationIds = scope.conversations.map((c) => c.id);
      const booked = await this.bookings.anonymiseSalonClient(tx, salonId, scope.phones);
      // Unlink Zalo from these bookings so no reminder/confirmation reaches the old chat.
      await tx.zaloBookingLink.deleteMany({
        where: { salonId, bookingId: { in: booked.bookingIds } },
      });
      const messages = await tx.zaloMessage.deleteMany({
        where: { salonId, conversationId: { in: conversationIds } },
      });
      await tx.zaloConversation.updateMany({
        where: { salonId, id: { in: conversationIds } },
        data: {
          displayName: null,
          phoneE164: null,
          botState: {},
          unreadCount: 0,
          assignedUserId: null,
          handoffRequestedAt: null,
        },
      });
      await tx.zaloSendLog.updateMany({
        where: { salonId, conversationId: { in: conversationIds } },
        data: { request: {} },
      });
      for (const c of scope.conversations) {
        // Raw webhook payloads (purged after 30 days anyway) carry this user's messages.
        await tx.$executeRaw`
          DELETE FROM zalo_webhook_events
          WHERE oa_id = ${c.oaId}
            AND (payload->'sender'->>'id' = ${c.zaloUserId}
              OR payload->'recipient'->>'id' = ${c.zaloUserId}
              OR payload->'follower'->>'id' = ${c.zaloUserId})`;
      }
      // q71: the salon's notes about the person are deleted, not kept.
      const notes = await tx.customerNote.deleteMany({
        where: { salonId, profileId: { in: scope.profileIds } },
      });
      // Merged profiles first (they point at the main one), then the profile itself.
      await tx.customerSalonProfile.deleteMany({
        where: { salonId, mergedIntoId: profileId },
      });
      await tx.customerSalonProfile.deleteMany({ where: { salonId, id: profileId } });
      const result = {
        anonymisedBookings: booked.anonymised,
        deletedNotes: notes.count,
        zaloConversations: conversationIds.length,
        deletedZaloMessages: messages.count,
      };
      await this.audit.record(
        {
          action: "privacy.client_erased",
          salonId,
          organizationId: ctx.organizationId,
          targetType: "customer_salon_profile",
          targetId: profileId,
          metadata: { ...result, upcomingBookings: booked.upcomingIds.length },
        },
        tx,
      );
      return { ...result, upcomingIds: booked.upcomingIds };
    });
    const cancelled = await this.bookings.cancelForErasure(ctx.salonId, done.upcomingIds);
    return {
      anonymisedBookings: done.anonymisedBookings,
      cancelledBookings: cancelled,
      deletedNotes: done.deletedNotes,
      zaloConversations: done.zaloConversations,
      deletedZaloMessages: done.deletedZaloMessages,
    };
  }
}

const notFound = () => new AppError(404, CUSTOMER_ERRORS.notFound, "Client not found");
