import { Injectable } from "@nestjs/common";
import {
  type AdminAuditEntry,
  type AdminOverride,
  type AdminSalonDetail,
  type AdminSalonList,
  type AdminSalonListItem,
  type AdminSalonListQuery,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  parseEntitlementValue,
  planCodeSchema,
  type SalonStatus,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import {
  Clock,
  EntitlementService,
  effectiveStatus,
} from "../../subscriptions/subscriptions.facade";
import { AdminUsageQueries } from "./admin-usage.queries";
import { decodeOffset, encodeOffset } from "./cursor";

const DAY_MS = 86_400_000;
const RECENT_AUDIT = 25;

interface SalonRow {
  id: string;
  name: string;
  slug: string;
  status: SalonStatus;
  created_at: Date;
  plan: string | null;
  sub_status: AdminSalonListItem["subscriptionStatus"];
  trial_ends_at: Date | null;
  paid_until: Date | null;
  bookings_total: number;
  bookings_30d: number;
  last_activity_at: Date | null;
  zalo_connected: boolean;
  founding_partner: boolean;
  total: bigint;
}

const SORTS: Record<AdminSalonListQuery["sort"], Prisma.Sql> = {
  created_desc: Prisma.sql`created_at DESC, id DESC`,
  created_asc: Prisma.sql`created_at ASC, id ASC`,
  name_asc: Prisma.sql`lower(name) ASC, id ASC`,
  trial_ends_asc: Prisma.sql`trial_ends_at ASC NULLS LAST, id ASC`,
  last_activity_desc: Prisma.sql`last_activity_at DESC NULLS LAST, id DESC`,
  bookings_desc: Prisma.sql`bookings_total DESC, id DESC`,
};

/**
 * Platform-wide salon directory (topic 12 M12.6). Deliberately cross-tenant: only platform-role
 * routes reach it. Reads salon, subscription, booking, Zalo and audit tables directly (an admin
 * read model, no writes). Pagination is an opaque offset cursor: admin lists sort by derived
 * columns (activity, bookings) where keyset cursors do not fit; the list is bounded by `limit`.
 */
@Injectable()
export class AdminSalonsQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly entitlements: EntitlementService,
    private readonly usage: AdminUsageQueries,
  ) {}

  async list(query: AdminSalonListQuery): Promise<AdminSalonList> {
    const now = this.clock.now();
    const offset = decodeOffset(query.cursor);
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(Prisma.sql`(name ILIKE ${like} OR slug::text ILIKE ${like})`);
    }
    if (query.plan === "none") where.push(Prisma.sql`plan IS NULL`);
    else if (query.plan) where.push(Prisma.sql`plan = ${query.plan}`);
    if (query.subscriptionStatus) where.push(Prisma.sql`sub_status = ${query.subscriptionStatus}`);
    if (query.trialEndsWithinDays !== undefined) {
      const until = new Date(now.getTime() + query.trialEndsWithinDays * DAY_MS);
      where.push(
        Prisma.sql`sub_status = 'trialing' AND trial_ends_at > ${now} AND trial_ends_at <= ${until}`,
      );
    }
    if (query.createdFrom) {
      where.push(Prisma.sql`created_at >= ${new Date(`${query.createdFrom}T00:00:00Z`)}`);
    }
    if (query.createdTo) {
      const end = new Date(`${query.createdTo}T00:00:00Z`).getTime() + DAY_MS;
      where.push(Prisma.sql`created_at < ${new Date(end)}`);
    }
    if (query.activeWithinDays !== undefined) {
      const since = new Date(now.getTime() - query.activeWithinDays * DAY_MS);
      where.push(Prisma.sql`last_activity_at >= ${since}`);
    }
    if (query.inactiveForDays !== undefined) {
      const before = new Date(now.getTime() - query.inactiveForDays * DAY_MS);
      where.push(Prisma.sql`(last_activity_at IS NULL OR last_activity_at < ${before})`);
    }
    if (query.minBookings !== undefined) {
      where.push(Prisma.sql`bookings_total >= ${query.minBookings}`);
    }
    if (query.zaloConnected !== undefined) {
      where.push(Prisma.sql`zalo_connected = ${query.zaloConnected}`);
    }
    if (query.foundingPartner !== undefined) {
      where.push(Prisma.sql`founding_partner = ${query.foundingPartner}`);
    }
    if (query.salonStatus) where.push(Prisma.sql`status::text = ${query.salonStatus}`);

    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const rows = await this.prisma.$queryRaw<SalonRow[]>`
      WITH cur AS (
        SELECT DISTINCT ON (s.salon_id)
          s.salon_id, s.status::text AS status, s.trial_ends_at, s.current_period_end, p.code AS plan
        FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        ORDER BY s.salon_id, s.created_at DESC, s.id DESC
      ),
      base AS (
        SELECT sa.id, sa.name, sa.slug::text AS slug, sa.status, sa.created_at,
          cur.plan,
          CASE
            WHEN cur.salon_id IS NULL THEN 'none'
            WHEN cur.status = 'trialing' AND cur.trial_ends_at <= ${now} THEN 'expired'
            ELSE cur.status
          END AS sub_status,
          cur.trial_ends_at,
          CASE WHEN cur.plan <> 'trial' THEN cur.current_period_end END AS paid_until,
          (SELECT count(*) FROM bookings b WHERE b.salon_id = sa.id)::int AS bookings_total,
          (SELECT count(*) FROM bookings b
            WHERE b.salon_id = sa.id AND b.created_at >= ${since30})::int AS bookings_30d,
          GREATEST(
            (SELECT max(se.last_seen_at) FROM salon_members m
              JOIN sessions se ON se.user_id = m.user_id
              WHERE m.salon_id = sa.id AND m.status = 'active'),
            (SELECT max(b.created_at) FROM bookings b WHERE b.salon_id = sa.id),
            (SELECT max(a.created_at) FROM audit_logs a
              WHERE a.salon_id = sa.id AND a.actor_type <> 'platform_admin')
          ) AS last_activity_at,
          EXISTS (SELECT 1 FROM zalo_oa_connections z
            WHERE z.salon_id = sa.id AND z.status = 'connected') AS zalo_connected,
          EXISTS (SELECT 1 FROM founding_partners f
            WHERE f.organization_id = sa.organization_id AND f.revoked_at IS NULL) AS founding_partner
        FROM salons sa LEFT JOIN cur ON cur.salon_id = sa.id
        WHERE sa.deleted_at IS NULL
      )
      SELECT *, count(*) OVER () AS total FROM base
      WHERE ${Prisma.join(where, " AND ")}
      ORDER BY ${SORTS[query.sort]}
      LIMIT ${query.limit} OFFSET ${offset}`;

    const total = rows[0] ? Number(rows[0].total) : 0;
    const next = offset + rows.length;
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        createdAt: r.created_at.toISOString(),
        plan: r.plan ? planCodeSchema.parse(r.plan) : null,
        subscriptionStatus: r.sub_status,
        trialEndsAt: r.trial_ends_at?.toISOString() ?? null,
        paidUntil: r.paid_until?.toISOString() ?? null,
        paidUntilOverdue:
          r.paid_until !== null &&
          r.paid_until <= now &&
          (r.sub_status === "active" || r.sub_status === "past_due"),
        bookingsTotal: r.bookings_total,
        bookings30d: r.bookings_30d,
        lastActivityAt: r.last_activity_at?.toISOString() ?? null,
        zaloConnected: r.zalo_connected,
        foundingPartner: r.founding_partner,
      })),
      nextCursor: rows.length === query.limit && next < total ? encodeOffset(next) : null,
      total,
    };
  }

  async detail(salonId: string): Promise<AdminSalonDetail> {
    const now = this.clock.now();
    const salon = await this.prisma.salon.findFirst({
      where: { id: salonId, deletedAt: null },
      include: {
        organization: { select: { id: true, name: true, foundingPartner: true } },
        members: {
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: {
                email: true,
                profile: { select: { displayName: true } },
                sessions: {
                  orderBy: { lastSeenAt: "desc" },
                  take: 1,
                  select: { lastSeenAt: true },
                },
              },
            },
          },
        },
        zaloConnection: { select: { status: true } },
      },
    });
    if (!salon) throw new AppError(404, "common.not_found", "Salon not found");

    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const [subscription, overrides, bookingsTotal, bookings30d, audit, entitlements, usage] =
      await Promise.all([
        this.prisma.subscription.findFirst({
          where: { salonId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            plan: { select: { code: true } },
            events: { orderBy: { occurredAt: "desc" }, take: 50 },
          },
        }),
        this.prisma.entitlementOverride.findMany({
          where: { salonId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        this.prisma.booking.count({ where: { salonId } }),
        this.prisma.booking.count({ where: { salonId, createdAt: { gte: since30 } } }),
        this.prisma.auditLog.findMany({
          where: { salonId },
          orderBy: { createdAt: "desc" },
          take: RECENT_AUDIT,
        }),
        this.entitlements.forSalon(salonId),
        this.usage.forSalon(salonId),
      ]);
    const [activity] = await this.prisma.$queryRaw<{ at: Date | null }[]>`
      SELECT GREATEST(
        (SELECT max(se.last_seen_at) FROM salon_members m JOIN sessions se ON se.user_id = m.user_id
          WHERE m.salon_id = ${salonId}::uuid AND m.status = 'active'),
        (SELECT max(b.created_at) FROM bookings b WHERE b.salon_id = ${salonId}::uuid),
        (SELECT max(a.created_at) FROM audit_logs a
          WHERE a.salon_id = ${salonId}::uuid AND a.actor_type <> 'platform_admin')
      ) AS at`;

    const fp = salon.organization.foundingPartner;
    return {
      salon: {
        id: salon.id,
        name: salon.name,
        slug: salon.slug,
        status: salon.status,
        createdAt: salon.createdAt.toISOString(),
        timezone: salon.timezone,
        verifiedAt: salon.verifiedAt?.toISOString() ?? null,
        suspendedAt: salon.suspendedAt?.toISOString() ?? null,
        organization: { id: salon.organization.id, name: salon.organization.name },
      },
      members: salon.members.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        displayName: m.user.profile?.displayName ?? null,
        role: m.role,
        status: m.status,
        lastSeenAt: m.user.sessions[0]?.lastSeenAt.toISOString() ?? null,
      })),
      subscription: subscription
        ? {
            id: subscription.id,
            plan: planCodeSchema.parse(subscription.plan.code),
            planVersion: subscription.planVersion,
            status: effectiveStatus(subscription, now),
            storedStatus: subscription.status,
            interval: subscription.interval,
            billingMode: "manual",
            invoicingEntity: subscription.invoicingEntity,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
            paidUntil:
              subscription.plan.code === "trial"
                ? null
                : (subscription.currentPeriodEnd?.toISOString() ?? null),
            createdAt: subscription.createdAt.toISOString(),
          }
        : null,
      subscriptionHistory: (subscription?.events ?? []).map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        fromPlan: e.fromPlanCode,
        toPlan: e.toPlanCode,
        actor: e.actor,
        reason: e.reason,
        occurredAt: e.occurredAt.toISOString(),
      })),
      entitlements: entitlements.entitlements,
      overrides: overrides.map((o): AdminOverride => {
        const value =
          o.key in ENTITLEMENT_KEYS
            ? parseEntitlementValue(o.key as EntitlementKey, o.value)
            : undefined;
        return {
          id: o.id,
          key: o.key,
          value: value ?? null,
          reason: o.reason,
          createdBy: o.createdBy,
          expiresAt: o.expiresAt?.toISOString() ?? null,
          revokedAt: o.revokedAt?.toISOString() ?? null,
          createdAt: o.createdAt.toISOString(),
          active: o.revokedAt === null && (o.expiresAt === null || o.expiresAt > now),
        };
      }),
      foundingPartner: fp
        ? {
            qualifiedAt: fp.qualifiedAt.toISOString(),
            source: fp.source,
            revokedAt: fp.revokedAt?.toISOString() ?? null,
          }
        : null,
      usage,
      bookingsTotal,
      bookings30d,
      zalo: {
        connected: salon.zaloConnection?.status === "connected",
        status: salon.zaloConnection?.status ?? null,
      },
      lastActivityAt: activity?.at?.toISOString() ?? null,
      recentAudit: audit.map((a): AdminAuditEntry => ({
        id: a.id,
        action: a.action,
        actorType: a.actorType,
        actorId: a.actorId,
        targetType: a.targetType,
        createdAt: a.createdAt.toISOString(),
        metadata:
          typeof a.metadata === "object" && a.metadata !== null && !Array.isArray(a.metadata)
            ? (a.metadata as Record<string, unknown>)
            : {},
      })),
    };
  }
}
