import { Injectable } from "@nestjs/common";
import {
  CUSTOMER_ERRORS,
  type CustomerDetail,
  type CustomerList,
  type CustomerListQuery,
  type CustomerSummary,
} from "@gugu/contracts";
import { maskEmail, maskPhone, normalizeVnPhone } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import type { CrmScope } from "../../salon-crm/salon-crm.facade";

type Row = {
  id: string;
  display_name: string;
  phone_e164: string | null;
  tags: string[];
  created_at: Date;
  visits: bigint;
  no_shows: bigint;
  last_visit: Date | null;
  next_visit: Date | null;
  spend: bigint;
  at_risk: boolean;
  total: bigint;
};

const AT_RISK_MIN_DAYS = 45;

/**
 * Customers directory (07 §3.5). Statistics come from bookings by phone at query time; profiles
 * keep name, tags, consent and notes. With an own scope (staff) only clients of the member's own
 * appointments are visible, and only those appointments.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Creates profiles for phones that so far exist only in bookings (idempotent). */
  async materialize(salonId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO customer_salon_profiles (id, salon_id, phone_e164, display_name, source, updated_at)
      SELECT uuidv7(), b.salon_id, b.customer_phone_e164,
             (array_agg(b.customer_name ORDER BY b.starts_at DESC))[1], 'booking', now()
      FROM bookings b
      WHERE b.salon_id = ${salonId}::uuid AND b.customer_phone_e164 IS NOT NULL AND b.customer_name IS NOT NULL
      GROUP BY b.salon_id, b.customer_phone_e164
      ON CONFLICT (salon_id, phone_e164)
        WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL AND merged_into_id IS NULL
      DO NOTHING`;
  }

  async list(ctx: SalonContext, scope: CrmScope, query: CustomerListQuery): Promise<CustomerList> {
    await this.materialize(ctx.salonId);
    const showPhone = ctx.permissions.has("customers.phone.read");
    const digits = query.q.replace(/\D/g, "").replace(/^0+/, "");
    const phoneLike = showPhone && digits.length >= 3 ? `%${digits}%` : null;
    const nameLike =
      query.q.trim().length >= 1 && !phoneLike
        ? `%${query.q
            .trim()
            .toLowerCase()
            .replace(/[%_\\]/g, "")}%`
        : null;
    const own = scope.staffId;
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH stats AS (
        SELECT b.customer_phone_e164 AS phone,
          count(*) FILTER (WHERE b.status = 'completed') AS visits,
          count(*) FILTER (WHERE b.status = 'no_show') AS no_shows,
          max(b.starts_at) FILTER (WHERE b.status = 'completed') AS last_visit,
          min(b.starts_at) FILTER (WHERE b.status = 'completed') AS first_visit,
          min(b.starts_at) FILTER (WHERE b.status IN ('pending', 'confirmed', 'checked_in') AND b.starts_at > now()) AS next_visit,
          coalesce(sum(b.total_price_minor) FILTER (WHERE b.status = 'completed'), 0) AS spend,
          bool_or(${own}::uuid IS NULL OR b.staff_id = ${own}::uuid) AS visible
        FROM bookings b
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.customer_phone_e164 IS NOT NULL
          AND (${own}::uuid IS NULL OR b.staff_id = ${own}::uuid)
        GROUP BY b.customer_phone_e164
      ), rows AS (
        SELECT p.id, p.display_name, p.phone_e164, p.tags, p.created_at,
          coalesce(s.visits, 0) AS visits, coalesce(s.no_shows, 0) AS no_shows,
          s.last_visit, s.next_visit, coalesce(s.spend, 0) AS spend,
          (coalesce(s.visits, 0) >= 2 AND s.next_visit IS NULL AND s.last_visit <
            now() - greatest(make_interval(days => ${AT_RISK_MIN_DAYS}::int),
              2 * (s.last_visit - s.first_visit) / greatest(s.visits - 1, 1))) AS at_risk,
          s.first_visit
        FROM customer_salon_profiles p
        LEFT JOIN stats s ON s.phone = p.phone_e164
        WHERE p.salon_id = ${ctx.salonId}::uuid AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
          AND (${own}::uuid IS NULL OR s.visible)
          AND (${phoneLike}::text IS NULL OR p.phone_e164 LIKE ${phoneLike})
          AND (${nameLike}::text IS NULL OR unaccent(lower(p.display_name)) LIKE unaccent(${nameLike}))
          AND (${query.tag ?? null}::text IS NULL OR ${query.tag ?? null} = ANY(p.tags))
      )
      SELECT *, count(*) OVER () AS total FROM rows
      WHERE ${query.segment} = 'all'
        OR (${query.segment} = 'new' AND first_visit >= now() - interval '30 days')
        OR (${query.segment} = 'returning' AND visits >= 2)
        OR (${query.segment} = 'at_risk' AND at_risk)
        OR (${query.segment} = 'no_shows' AND no_shows > 0)
      ORDER BY coalesce(next_visit, last_visit, created_at) DESC, id
      LIMIT ${query.limit} OFFSET ${query.offset}`;
    // Own scope: only tags of profiles visible to the member (same predicate as `stats`).
    const tags = await this.prisma.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT unnest(p.tags) AS tag FROM customer_salon_profiles p
      WHERE p.salon_id = ${ctx.salonId}::uuid AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
        AND (${own}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.salon_id = p.salon_id AND b.customer_phone_e164 = p.phone_e164
            AND b.staff_id = ${own}::uuid))
      ORDER BY 1 LIMIT 100`;
    return {
      items: rows.map((r) => this.summary(r, showPhone)),
      total: Number(rows[0]?.total ?? 0),
      tags: tags.map((t) => t.tag),
    };
  }

  async detail(
    ctx: SalonContext,
    scope: CrmScope,
    id: string,
    userId: string,
  ): Promise<CustomerDetail> {
    const showPhone = ctx.permissions.has("customers.phone.read");
    const profile = await this.prisma.customerSalonProfile.findFirst({
      where: { id, salonId: ctx.salonId, deletedAt: null, mergedIntoId: null },
    });
    if (!profile) throw notFound();
    const bookings = profile.phoneE164
      ? await this.prisma.booking.findMany({
          where: {
            salonId: ctx.salonId,
            customerPhoneE164: profile.phoneE164,
            ...(scope.staffId ? { staffId: scope.staffId } : {}),
          },
          orderBy: { startsAt: "desc" },
          take: 200,
          include: {
            services: { select: { serviceId: true, name: true }, orderBy: { sequence: "asc" } },
          },
        })
      : [];
    if (scope.staffId && bookings.length === 0) throw notFound();
    const now = Date.now();
    const visit = (b: (typeof bookings)[number]) => {
      // Multi-service bookings (M6.8) list every service: "Sơn gel + Pedicure".
      const names = b.services.map((l) => (l.name ?? {}) as Partial<Record<"vi" | "en", string>>);
      return {
        bookingId: b.id,
        startsAt: b.startsAt.toISOString(),
        status: b.status,
        service: {
          vi: names.map((n) => n.vi ?? "").join(" + "),
          en: names.map((n) => n.en ?? n.vi ?? "").join(" + "),
        },
        staffId: b.staffId,
        priceMinor: Number(b.totalPriceMinor),
      };
    };
    const completed = bookings.filter((b) => b.status === "completed");
    const active = ["pending", "confirmed", "checked_in"];
    const upcoming = bookings
      .filter((b) => active.includes(b.status) && b.startsAt.getTime() > now)
      .reverse();
    const counts = new Map<string, number>();
    for (const b of completed)
      for (const s of b.services) counts.set(s.serviceId, (counts.get(s.serviceId) ?? 0) + 1);
    const canNotes = ctx.permissions.has("customers.notes.write");
    const notes = canNotes
      ? await this.prisma.customerNote.findMany({
          where: { salonId: ctx.salonId, profileId: id, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            author: { select: { profile: { select: { displayName: true } }, email: true } },
          },
        })
      : null;
    const lastVisit = completed[0]?.startsAt ?? null;
    const firstVisit = completed.at(-1)?.startsAt ?? null;
    const avgGap =
      completed.length >= 2 && lastVisit && firstVisit
        ? (lastVisit.getTime() - firstVisit.getTime()) / (completed.length - 1)
        : 0;
    const consent = (profile.marketingConsent ?? {}) as Partial<
      Record<"zalo" | "email" | "sms", boolean>
    >;
    return {
      id: profile.id,
      displayName: profile.displayName,
      phone: profile.phoneE164
        ? showPhone
          ? profile.phoneE164
          : maskPhone(profile.phoneE164)
        : null,
      // q87: stored only, never used for sending (X26); same visibility as the phone.
      email: profile.email ? (showPhone ? profile.email : maskEmail(profile.email)) : null,
      tags: profile.tags,
      visits: completed.length,
      noShows: bookings.filter((b) => b.status === "no_show").length,
      lastVisitAt: lastVisit?.toISOString() ?? null,
      nextVisitAt: upcoming[0]?.startsAt.toISOString() ?? null,
      estimatedSpend: completed.reduce((s, b) => s + Number(b.totalPriceMinor), 0),
      atRisk:
        completed.length >= 2 &&
        upcoming.length === 0 &&
        lastVisit !== null &&
        now - lastVisit.getTime() > Math.max(AT_RISK_MIN_DAYS * 86_400_000, 2 * avgGap),
      consent: {
        zalo: consent.zalo === true,
        email: consent.email === true,
        sms: consent.sms === true,
      },
      createdAt: profile.createdAt.toISOString(),
      upcoming: upcoming.map(visit),
      history: bookings
        .filter((b) => !upcoming.includes(b))
        .slice(0, 30)
        .map(visit),
      notes:
        notes?.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.author.profile?.displayName ?? n.author.email?.split("@")[0] ?? null,
          createdAt: n.createdAt.toISOString(),
          mine: n.authorUserId === userId,
        })) ?? null,
      favouriteServiceIds: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k),
    };
  }

  async create(
    ctx: SalonContext,
    input: { displayName: string; phone: string | null; email?: string | null | undefined },
  ): Promise<{ id: string }> {
    const email = normalizeEmail(input.email);
    if (email !== null) assertContactAccess(ctx);
    const phone = input.phone ? normalizeVnPhone(input.phone) : null;
    if (input.phone && !phone) throw new AppError(400, "booking.phone_invalid", "Invalid phone");
    if (phone) {
      const exists = await this.prisma.customerSalonProfile.findFirst({
        where: { salonId: ctx.salonId, phoneE164: phone, deletedAt: null, mergedIntoId: null },
        select: { id: true },
      });
      // Without customers.phone.read the id would be an oracle for phone numbers: generic conflict.
      if (exists)
        throw new AppError(
          409,
          CUSTOMER_ERRORS.phoneTaken,
          "Client exists",
          ctx.permissions.has("customers.phone.read") ? { detail: exists.id } : undefined,
        );
    }
    const row = await this.prisma.customerSalonProfile.create({
      data: {
        salonId: ctx.salonId,
        displayName: input.displayName,
        phoneE164: phone,
        email,
        source: "manual",
      },
    });
    await this.record(ctx, "customers.created", row.id);
    return { id: row.id };
  }

  async update(
    ctx: SalonContext,
    id: string,
    patch: {
      displayName?: string | undefined;
      tags?: string[] | undefined;
      consent?: { zalo: boolean; email: boolean; sms: boolean } | undefined;
      email?: string | null | undefined;
    },
  ): Promise<void> {
    // Editing the email needs the right that shows it unmasked (same rule as the phone, q87).
    if (patch.email !== undefined) assertContactAccess(ctx);
    const { count } = await this.prisma.customerSalonProfile.updateMany({
      where: { id, salonId: ctx.salonId, deletedAt: null },
      data: {
        ...(patch.displayName ? { displayName: patch.displayName } : {}),
        ...(patch.tags ? { tags: [...new Set(patch.tags)] } : {}),
        ...(patch.consent ? { marketingConsent: patch.consent } : {}),
        ...(patch.email !== undefined ? { email: normalizeEmail(patch.email) } : {}),
      },
    });
    if (count === 0) throw notFound();
    await this.record(ctx, "customers.updated", id, { fields: Object.keys(patch).join(",") });
  }

  async addNote(
    ctx: SalonContext,
    scope: CrmScope,
    id: string,
    userId: string,
    body: string,
  ): Promise<void> {
    await this.detail(ctx, scope, id, userId);
    await this.prisma.customerNote.create({
      data: { salonId: ctx.salonId, profileId: id, authorUserId: userId, body },
    });
    await this.record(ctx, "customers.note_added", id);
  }

  /** Authors delete their own notes; owners and managers any note. */
  async deleteNote(ctx: SalonContext, id: string, noteId: string, userId: string): Promise<void> {
    const elevated = ctx.role === "owner" || ctx.role === "manager";
    const { count } = await this.prisma.customerNote.updateMany({
      where: {
        id: noteId,
        profileId: id,
        salonId: ctx.salonId,
        deletedAt: null,
        ...(elevated ? {} : { authorUserId: userId }),
      },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new AppError(404, CUSTOMER_ERRORS.noteNotFound, "Note not found");
    await this.record(ctx, "customers.note_deleted", id);
  }

  private summary(r: Row, showPhone: boolean): CustomerSummary {
    return {
      id: r.id,
      displayName: r.display_name,
      phone: r.phone_e164 ? (showPhone ? r.phone_e164 : maskPhone(r.phone_e164)) : null,
      tags: r.tags,
      visits: Number(r.visits),
      noShows: Number(r.no_shows),
      lastVisitAt: r.last_visit?.toISOString() ?? null,
      nextVisitAt: r.next_visit?.toISOString() ?? null,
      estimatedSpend: Number(r.spend),
      atRisk: r.at_risk,
    };
  }

  private record(
    ctx: SalonContext,
    action:
      "customers.created" | "customers.updated" | "customers.note_added" | "customers.note_deleted",
    id: string,
    metadata: Record<string, string> = {},
  ) {
    return this.audit.record({
      action,
      salonId: ctx.salonId,
      organizationId: ctx.organizationId,
      targetType: "customer_salon_profile",
      targetId: id,
      metadata,
    });
  }
}

const notFound = () => new AppError(404, CUSTOMER_ERRORS.notFound, "Client not found");

const normalizeEmail = (v: string | null | undefined): string | null =>
  v?.trim().toLowerCase() || null;

function assertContactAccess(ctx: SalonContext): void {
  if (!ctx.permissions.has("customers.phone.read")) {
    throw new AppError(403, COMMON_ERRORS.forbidden, "Permission required");
  }
}
