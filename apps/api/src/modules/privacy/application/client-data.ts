import type { ClientExport } from "@gugu/contracts";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";

type Db = Prisma.TransactionClient;

const name = (v: unknown): { vi: string; en: string } => {
  const n = (v ?? {}) as Partial<Record<"vi" | "en", string>>;
  return { vi: n.vi ?? "", en: n.en ?? n.vi ?? "" };
};

/**
 * Everything one salon keeps about one client, keyed the way the CRM links it: the profile (plus
 * profiles merged into it), bookings by the profiles' phone numbers, notes, Zalo conversations with
 * those phones or linked to those bookings, and customer notifications about those bookings or
 * conversations. Every query is scoped by `salonId` (server-resolved SalonContext).
 */
export async function loadClientScope(db: Db, salonId: string, profileId: string) {
  const profile = await db.customerSalonProfile.findFirst({
    where: { id: profileId, salonId, deletedAt: null, mergedIntoId: null },
  });
  if (!profile) return null;
  const merged = await db.customerSalonProfile.findMany({
    where: { salonId, mergedIntoId: profile.id },
    select: { id: true, phoneE164: true },
  });
  const profileIds = [profile.id, ...merged.map((m) => m.id)];
  const phones = [
    ...new Set([profile.phoneE164, ...merged.map((m) => m.phoneE164)].filter(isString)),
  ];
  const bookings = phones.length
    ? await db.booking.findMany({
        where: { salonId, customerPhoneE164: { in: phones } },
        select: { id: true },
      })
    : [];
  const bookingIds = bookings.map((b) => b.id);
  const linked = [
    ...(phones.length ? [{ phoneE164: { in: phones } }] : []),
    ...(bookingIds.length ? [{ bookingLinks: { some: { bookingId: { in: bookingIds } } } }] : []),
  ];
  const conversations = linked.length
    ? await db.zaloConversation.findMany({
        where: { salonId, OR: linked },
        select: { id: true, oaId: true, zaloUserId: true },
      })
    : [];
  return { profile, profileIds, phones, bookingIds, conversations };
}

export type ClientScope = NonNullable<Awaited<ReturnType<typeof loadClientScope>>>;

/** Builds the JSON export (`gugu.client-export.v1`) for a scope. Staff names are left out. */
export async function buildClientExport(
  db: Db,
  salon: { id: string; name: string },
  scope: ClientScope,
  now: Date,
): Promise<ClientExport> {
  const { profile, bookingIds, conversations, profileIds } = scope;
  const conversationIds = conversations.map((c) => c.id);
  const [bookings, notes, convs, deliveries] = await Promise.all([
    db.booking.findMany({
      where: { salonId: salon.id, id: { in: bookingIds } },
      orderBy: { startsAt: "asc" },
      include: {
        services: { select: { name: true, priceMinor: true } },
        offlineSale: { select: { amountMinor: true, method: true, recordedAt: true } },
        history: { orderBy: { occurredAt: "asc" } },
      },
    }),
    db.customerNote.findMany({
      where: { salonId: salon.id, profileId: { in: profileIds }, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { body: true, createdAt: true },
    }),
    db.zaloConversation.findMany({
      where: { salonId: salon.id, id: { in: conversationIds } },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    db.notificationDelivery.findMany({
      where: {
        salonId: salon.id,
        audience: "customer",
        OR: [{ bookingId: { in: bookingIds } }, { conversationId: { in: conversationIds } }],
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const refById = new Map(bookings.map((b) => [b.id, b.referenceCode]));
  const consent = (profile.marketingConsent ?? {}) as Partial<
    Record<"zalo" | "email" | "sms", boolean>
  >;
  return {
    format: "gugu.client-export.v1",
    exportedAt: now.toISOString(),
    salon,
    client: {
      id: profile.id,
      displayName: profile.displayName,
      phone: profile.phoneE164,
      tags: profile.tags,
      marketingConsent: {
        zalo: consent.zalo === true,
        email: consent.email === true,
        sms: consent.sms === true,
      },
      source: profile.source,
      createdAt: profile.createdAt.toISOString(),
    },
    bookings: bookings.map((b) => ({
      id: b.id,
      referenceCode: b.referenceCode,
      status: b.status,
      source: b.source,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      services: b.services.map((s) => ({ name: name(s.name), priceMinor: Number(s.priceMinor) })),
      totalPriceMinor: Number(b.totalPriceMinor),
      currency: b.currency,
      customerName: b.customerName,
      customerPhone: b.customerPhoneE164,
      customerEmail: b.customerEmail,
      customerNote: b.customerNote,
      cancellationReason: b.cancellationReason,
      createdAt: b.createdAt.toISOString(),
      payment: b.offlineSale
        ? {
            amountMinor: Number(b.offlineSale.amountMinor),
            method: b.offlineSale.method,
            recordedAt: b.offlineSale.recordedAt.toISOString(),
          }
        : null,
      history: b.history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        at: h.occurredAt.toISOString(),
        reasonCode: h.reasonCode,
        reasonText: h.reasonText,
      })),
    })),
    notes: notes.map((n) => ({ body: n.body, createdAt: n.createdAt.toISOString() })),
    zalo: convs.map((c) => ({
      conversationId: c.id,
      displayName: c.displayName,
      phone: c.phoneE164,
      followedAt: c.followedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      messages: c.messages.map((m) => ({
        at: m.createdAt.toISOString(),
        direction: m.direction,
        sender: m.sender,
        kind: m.kind,
        text: m.text,
      })),
    })),
    notificationDeliveries: deliveries.map((d) => ({
      bookingReference: d.bookingId ? (refById.get(d.bookingId) ?? null) : null,
      event: d.event,
      channel: d.channel,
      status: d.status,
      reason: d.reason,
      createdAt: d.createdAt.toISOString(),
      sentAt: d.sentAt?.toISOString() ?? null,
    })),
  };
}

function isString(v: string | null): v is string {
  return typeof v === "string" && v.length > 0;
}
