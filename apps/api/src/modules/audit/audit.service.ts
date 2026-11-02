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
  "booking.rules_overridden",
  "booking.rescheduled",
  "booking.status_corrected",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  action: AuditAction;
  actor?: { type: "anonymous" | "user" | "system"; id?: string | null };
  salonId?: string | null;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Never secrets, tokens, codes or personal data (emails, phones, names, notes). */
  metadata?: Record<string, string | number | boolean | null>;
  ipPrefix?: string | null;
  userAgent?: string | null;
}

type Tx = Prisma.TransactionClient;

/** Append-only audit trail (`audit_logs`; UPDATE/DELETE are rejected by a trigger). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes one entry; pass `tx` to commit it atomically with the audited change. */
  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const ctx = RequestContext.current();
    const actor = entry.actor ?? actorFromContext();
    await (tx ?? this.prisma).auditLog.create({
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
    });
  }
}

function actorFromContext(): NonNullable<AuditEntry["actor"]> {
  const actor = RequestContext.current()?.actor;
  if (!actor || actor.type === "anonymous") return { type: "anonymous" };
  return { type: actor.type === "user" ? "user" : "system", id: actor.id };
}
