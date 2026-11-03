import { Injectable } from "@nestjs/common";
import { NOTIFICATION_DELIVERY_RETENTION_MONTHS } from "@gugu/contracts";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const BATCH = 5_000;

/** Retention rules (docs/domains/auth-security.md#retention). Durations from `now`. */
export const RETENTION = {
  /** Spec 11 R20: the notification send log is kept 12 months. */
  notificationDeliveriesMonths: NOTIFICATION_DELIVERY_RETENTION_MONTHS,
  /** Sessions: deleted 30 days after they ended (revoked or expired). */
  endedSessionsMs: 30 * DAY,
  /** Magic links: deleted 1 day after expiry. */
  expiredMagicLinksMs: DAY,
  /** Idempotency keys (spec 06 §3.6: 24 h TTL), deleted after expiry. */
  idempotencyKeysMs: 0,
  /** A salon export stuck in queued/running this long is marked failed. */
  stuckExportMs: 6 * HOUR,
  /**
   * Audit log: AUDIT_RETENTION_MONTHS (default 24, owner answer q94; confirm in the legal review,
   * q04). Never below this floor — the `audit_logs_append_only` trigger enforces it as well.
   */
  auditLogMinMonths: 12,
} as const;

export type RetentionCounts = Record<
  | "notificationDeliveries"
  | "notifications"
  | "sessions"
  | "magicLinks"
  | "idempotencyKeys"
  | "exportsExpired"
  | "exportsFailed"
  | "auditLogs",
  number
>;

/**
 * Daily retention purge (`privacy.retention`, system job). Platform-wide on purpose: retention is
 * a platform rule, not a tenant action, and every statement is a time-based predicate that never
 * reads tenant data into the process. Deletes in batches so no statement holds long locks.
 * Zalo raw webhook events are purged by the zalo module (30 days). Audit logs are deleted after
 * AUDIT_RETENTION_MONTHS (q94) through the trigger's narrow retention exception.
 */
@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async purge(now = new Date()): Promise<RetentionCounts> {
    const deliveriesBefore = new Date(now);
    deliveriesBefore.setUTCMonth(
      deliveriesBefore.getUTCMonth() - RETENTION.notificationDeliveriesMonths,
    );
    const counts: RetentionCounts = {
      notifications: await this.batched(
        (limit) => this.prisma.$executeRaw`
          DELETE FROM notifications WHERE id IN (
            SELECT id FROM notifications WHERE created_at < ${deliveriesBefore} LIMIT ${limit})`,
      ),
      notificationDeliveries: await this.batched(
        (limit) => this.prisma.$executeRaw`
          DELETE FROM notification_deliveries WHERE id IN (
            SELECT id FROM notification_deliveries WHERE created_at < ${deliveriesBefore} LIMIT ${limit})`,
      ),
      sessions: await this.purgeSessions(new Date(now.getTime() - RETENTION.endedSessionsMs)),
      magicLinks: await this.batched(
        (limit) => this.prisma.$executeRaw`
          DELETE FROM magic_link_tokens WHERE id IN (
            SELECT id FROM magic_link_tokens
            WHERE expires_at < ${new Date(now.getTime() - RETENTION.expiredMagicLinksMs)}
            LIMIT ${limit})`,
      ),
      idempotencyKeys: await this.batched(
        (limit) => this.prisma.$executeRaw`
          DELETE FROM idempotency_keys WHERE id IN (
            SELECT id FROM idempotency_keys
            WHERE expires_at < ${new Date(now.getTime() - RETENTION.idempotencyKeysMs)}
            LIMIT ${limit})`,
      ),
      exportsExpired: (
        await this.prisma.privacyExport.updateMany({
          where: { status: "ready", expiresAt: { lte: now } },
          data: { status: "expired", jsonGz: null, csvGz: null },
        })
      ).count,
      exportsFailed: (
        await this.prisma.privacyExport.updateMany({
          where: {
            status: { in: ["queued", "running"] },
            createdAt: { lt: new Date(now.getTime() - RETENTION.stuckExportMs) },
          },
          data: { status: "failed", error: "timeout", completedAt: now },
        })
      ).count,
      auditLogs: await this.purgeAuditLogs(this.auditCutoff(now)),
    };
    if (Object.values(counts).some((n) => n > 0)) {
      await this.audit.record({
        action: "privacy.retention_purged",
        actor: { type: "system" },
        metadata: counts,
      });
    }
    return counts;
  }

  /** `now` minus AUDIT_RETENTION_MONTHS, never later than the 12-month floor. */
  auditCutoff(now: Date): Date {
    const months = Math.max(this.config.env.AUDIT_RETENTION_MONTHS, RETENTION.auditLogMinMonths);
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return cutoff;
  }

  /**
   * audit_logs is append-only; its trigger lets a DELETE through only with the transaction-local
   * flag `gugu.audit_retention = on` and only for rows older than 12 months. Each batch is its own
   * short transaction so the flag never outlives it.
   */
  private async purgeAuditLogs(before: Date): Promise<number> {
    return this.batched((limit) =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('gugu.audit_retention', 'on', true)`;
        return tx.$executeRaw`
          DELETE FROM audit_logs WHERE id IN (
            SELECT id FROM audit_logs WHERE created_at < ${before}
            ORDER BY created_at LIMIT ${limit})`;
      }),
    );
  }

  private async purgeSessions(before: Date): Promise<number> {
    return this.batched(async (limit) =>
      this.prisma.$transaction(async (tx) => {
        const ids = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM sessions
          WHERE (revoked_at IS NOT NULL AND revoked_at < ${before}) OR expires_at < ${before}
          LIMIT ${limit}`;
        if (ids.length === 0) return 0;
        const list = ids.map((r) => r.id);
        await tx.refreshToken.deleteMany({ where: { sessionId: { in: list } } });
        return (await tx.session.deleteMany({ where: { id: { in: list } } })).count;
      }),
    );
  }

  /** Repeats a LIMITed statement until it touches fewer rows than the batch size. */
  private async batched(run: (limit: number) => Promise<number>): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await run(BATCH);
      total += n;
      if (n < BATCH) return total;
    }
  }
}
