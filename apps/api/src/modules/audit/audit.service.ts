import { Injectable } from "@nestjs/common";
import { RequestContext } from "../../common/context/request-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { Prisma } from "../../infrastructure/prisma/generated/client";

/** Audited actions (spec 05 R29). Add new ones here so the list stays reviewable. */
export const AUDIT_ACTIONS = [
  "auth.sign_in",
  "auth.sign_out",
  "auth.sign_out_all",
  "auth.session_reuse_detected",
  "auth.identity_linked",
  "salon.registered",
  "salon.owner_verified",
  "salon.owner_declined",
  "salon.profile_updated",
  "salon.settings_updated",
  "salon.went_live",
  "catalog.service_created",
  "catalog.service_updated",
  "catalog.service_deleted",
  "team.staff_created",
  "team.staff_updated",
  "team.staff_removed",
  "team.schedule_updated",
  "team.time_off_added",
  "team.time_off_removed",
  "team.invitation_created",
  "team.invitation_revoked",
  "team.invitation_accepted",
  "team.member_role_changed",
  "booking.offline_sale_recorded",
  "customers.created",
  "customers.updated",
  "customers.note_added",
  "customers.note_deleted",
  "booking.rules_overridden",
  "booking.rescheduled",
  "booking.status_corrected",
  "ai_import.extracted",
  "ai_import.blocked",
  "ai_import.confirmed",
  "zalo.oa_connected",
  "zalo.oa_disconnected",
  "zalo.settings_updated",
  "zalo.conversation_taken_over",
  "zalo.conversation_released",
  // Platform admin (topic 12 M12.6): metadata = { reason, before, after }.
  "admin.subscription_plan_assigned",
  "admin.trial_extended",
  "admin.paid_until_set",
  "admin.salon_suspended",
  "admin.salon_unsuspended",
  "admin.entitlement_override_created",
  "admin.entitlement_override_revoked",
  "admin.founding_partner_granted",
  "admin.founding_partner_revoked",
  // Platform-admin second factor (topic 05 step 9, ADR-0011). Metadata: method / counts only.
  "admin.mfa_enrolled",
  "admin.mfa_reset",
  "admin.mfa_step_up",
  "admin.mfa_step_up_failed",
  "admin.mfa_recovery_codes_regenerated",
  /** q93: a super_admin reset ANOTHER admin's factor. Target = that user; metadata: reason, counts. */
  "admin.mfa_reset_by_admin",
  /** Written by scripts/seed-platform-admin.mjs (local dev) until topic 05 ships role management. */
  "admin.platform_role_granted",
  "notifications.settings_updated",
  // Privacy tools (topic 05 step 8). Metadata: counts and formats only, never client data.
  "privacy.client_exported",
  "privacy.client_erased",
  "privacy.salon_export_requested",
  "privacy.salon_export_downloaded",
  "privacy.retention_purged",
  // Staff pay & payroll (topic 07, ADR-0016). Metadata: dates, kinds, amounts, counts; never the
  // free-text reason of an adjustment, never names.
  "payroll.pay_settings_saved",
  "payroll.commission_policy_saved",
  "payroll.manager_access_changed",
  "payroll.adjustment_added",
  "payroll.adjustment_removed",
  "payroll.month_closed",
  "payroll.month_reopened",
  "payroll.marked_paid",
  "payroll.paid_mark_removed",
  "payroll.exported",
  "costs.created",
  "costs.updated",
  "costs.removed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** JSON metadata value (admin entries nest `before` / `after` snapshots). */
export type AuditValue =
  string | number | boolean | null | readonly AuditValue[] | { readonly [key: string]: AuditValue };

export interface AuditEntry {
  action: AuditAction;
  actor?: { type: "anonymous" | "user" | "system" | "platform_admin"; id?: string | null };
  salonId?: string | null;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Never secrets, tokens, codes or personal data (emails, phones, names, notes). */
  metadata?: Record<string, AuditValue>;
  ipPrefix?: string | null;
  userAgent?: string | null;
}

type Tx = Prisma.TransactionClient;

/** Append-only audit trail (`audit_logs`; UPDATE/DELETE are rejected by a trigger). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes one entry and returns its id; pass `tx` to commit it atomically with the change. */
  async record(entry: AuditEntry, tx?: Tx): Promise<string> {
    const ctx = RequestContext.current();
    const actor = entry.actor ?? actorFromContext();
    const row = await (tx ?? this.prisma).auditLog.create({
      data: {
        action: entry.action,
        actorType: actor.type,
        actorId: actor.id ?? null,
        salonId: entry.salonId ?? null,
        organizationId: entry.organizationId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        requestId: ctx?.requestId ?? null,
        ipPrefix: entry.ipPrefix ?? null,
        userAgent: entry.userAgent?.slice(0, 256) ?? null,
        metadata: entry.metadata ?? {},
      },
      select: { id: true },
    });
    return row.id;
  }
}

function actorFromContext(): NonNullable<AuditEntry["actor"]> {
  const actor = RequestContext.current()?.actor;
  if (!actor || actor.type === "anonymous") return { type: "anonymous" };
  return { type: actor.type === "user" ? "user" : "system", id: actor.id };
}
