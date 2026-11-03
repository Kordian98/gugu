import { Injectable } from "@nestjs/common";
import {
  ADMIN_ERRORS,
  type AdminAssignPlanInput,
  type AdminCreateOverrideInput,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  parseEntitlementValue,
  SUBSCRIPTION_ERRORS,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import {
  type EntitlementOverride,
  type FoundingPartner,
  Prisma,
  type Subscription,
} from "../../../infrastructure/prisma/generated/client";
import { canTransition, CURRENT_STATUSES } from "../domain/subscription-status";
import { Clock } from "./clock";

type Db = Prisma.TransactionClient;
/** JSON-safe snapshot of the changed record, for the audit log's before/after. */
export type Snapshot = Record<string, string | number | boolean | null>;
export interface AdminChange {
  before: Snapshot | null;
  after: Snapshot | null;
  targetType: string;
  targetId: string;
  /** Salons whose entitlement cache must be cleared (default: the salon in the URL). */
  salonIds?: string[];
}

const DAY_MS = 86_400_000;
export const MAX_TRIAL_AHEAD_DAYS = 90;
export const MAX_OVERRIDE_DAYS = 366;

/**
 * Manual subscription management for the platform admin (topic 12 M12.6; no payment processor,
 * no automatic charging — `paid` is what an admin records after an offline invoice is paid).
 *
 * Every method runs inside the caller's transaction and returns before/after snapshots; the admin
 * module wraps it with the reason + audit row in that same transaction and invalidates the
 * entitlement cache after commit. `actor` is `admin:<userId>` in subscription history.
 */
@Injectable()
export class SubscriptionAdminService {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  /** Assigns or changes the paid plan; the current subscription (or a new one) becomes active. */
  async assignPlan(
    db: Db,
    salonId: string,
    input: Omit<AdminAssignPlanInput, "reason">,
    actor: string,
    reason: string,
  ): Promise<AdminChange> {
    const now = this.clock.now();
    const paidUntil = new Date(input.paidUntil);
    if (paidUntil <= now) throw invalidDate("paidUntil");
    const plan = await db.plan.findUniqueOrThrow({ where: { code: input.plan } });
    const current = await lockCurrent(db, salonId);
    let after: Subscription;
    if (current) {
      if (current.status !== "active" && !canTransition(current.status, "active")) {
        throw new AppError(409, SUBSCRIPTION_ERRORS.invalidTransition, "Transition not allowed");
      }
      const fromPlan = await planCode(db, current.planId);
      after = await db.subscription.update({
        where: { id: current.id },
        data: {
          planId: plan.id,
          planVersion: plan.version,
          status: "active",
          interval: input.interval,
          trialEndsAt: null,
          // A new paid period starts when a trial converts or a lapsed (past_due) one resumes.
          currentPeriodStart: current.status === "active" ? current.currentPeriodStart : now,
          currentPeriodEnd: paidUntil,
          ...(input.invoicingEntity ? { invoicingEntity: input.invoicingEntity } : {}),
        },
      });
      await db.subscriptionEvent.create({
        data: {
          salonId,
          subscriptionId: current.id,
          fromStatus: current.status,
          toStatus: "active",
          fromPlanCode: fromPlan,
          toPlanCode: plan.code,
          actor,
          reason,
        },
      });
    } else {
      after = await createCurrent(db, {
        salonId,
        planId: plan.id,
        planVersion: plan.version,
        status: "active",
        interval: input.interval,
        invoicingEntity: input.invoicingEntity ?? "tbd",
        currentPeriodStart: now,
        currentPeriodEnd: paidUntil,
        events: {
          create: { fromStatus: null, toStatus: "active", toPlanCode: plan.code, actor, reason },
        },
      });
    }
    const salonIds = await this.qualifyFoundingPartner(db, salonId, after.id, now);
    return {
      before: current ? await snapshot(db, current) : null,
      after: await snapshot(db, after),
      targetType: "subscription",
      targetId: after.id,
      ...(salonIds ? { salonIds } : {}),
    };
  }

  /**
   * Sets a new trial end. A current trial is moved; a salon without a current subscription gets a
   * new trial (re-opened after expiry). A paid subscription cannot be put back on trial.
   */
  async extendTrial(
    db: Db,
    salonId: string,
    trialEndsAtIso: string,
    actor: string,
    reason: string,
  ): Promise<AdminChange> {
    const now = this.clock.now();
    const trialEndsAt = new Date(trialEndsAtIso);
    if (
      trialEndsAt <= now ||
      trialEndsAt.getTime() > now.getTime() + MAX_TRIAL_AHEAD_DAYS * DAY_MS
    ) {
      throw invalidDate("trialEndsAt");
    }
    const trialPlan = await db.plan.findUniqueOrThrow({ where: { code: "trial" } });
    const current = await lockCurrent(db, salonId);
    if (current && (current.status !== "trialing" || current.planId !== trialPlan.id)) {
      throw new AppError(409, ADMIN_ERRORS.trialNotExtendable, "Salon is on a paid plan");
    }
    let after: Subscription;
    if (current) {
      after = await db.subscription.update({
        where: { id: current.id },
        data: { trialEndsAt, currentPeriodEnd: trialEndsAt },
      });
      await db.subscriptionEvent.create({
        data: {
          salonId,
          subscriptionId: current.id,
          fromStatus: "trialing",
          toStatus: "trialing",
          actor,
          reason,
        },
      });
    } else {
      after = await createCurrent(db, {
        salonId,
        planId: trialPlan.id,
        planVersion: trialPlan.version,
        status: "trialing",
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        events: {
          create: { fromStatus: null, toStatus: "trialing", toPlanCode: "trial", actor, reason },
        },
      });
    }
    return {
      before: current ? await snapshot(db, current) : null,
      after: await snapshot(db, after),
      targetType: "subscription",
      targetId: after.id,
    };
  }

  /** Records the end of the paid period; a past_due subscription paid into the future is active. */
  async setPaidUntil(
    db: Db,
    salonId: string,
    paidUntilIso: string,
    actor: string,
    reason: string,
  ): Promise<AdminChange> {
    const now = this.clock.now();
    const paidUntil = new Date(paidUntilIso);
    const current = await lockCurrent(db, salonId);
    if (!current || current.status === "trialing") {
      throw new AppError(409, ADMIN_ERRORS.noCurrentSubscription, "No paid subscription");
    }
    if (current.currentPeriodStart && paidUntil <= current.currentPeriodStart) {
      throw invalidDate("paidUntil");
    }
    const toStatus = current.status === "past_due" && paidUntil > now ? "active" : current.status;
    const after = await db.subscription.update({
      where: { id: current.id },
      data: { currentPeriodEnd: paidUntil, status: toStatus },
    });
    await db.subscriptionEvent.create({
      data: {
        salonId,
        subscriptionId: current.id,
        fromStatus: current.status,
        toStatus,
        actor,
        reason,
      },
    });
    return {
      before: await snapshot(db, current),
      after: await snapshot(db, after),
      targetType: "subscription",
      targetId: current.id,
    };
  }

  async createOverride(
    db: Db,
    salonId: string,
    input: Omit<AdminCreateOverrideInput, "reason">,
    actor: string,
    reason: string,
  ): Promise<AdminChange> {
    const now = this.clock.now();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now || expiresAt.getTime() > now.getTime() + MAX_OVERRIDE_DAYS * DAY_MS) {
      throw invalidDate("expiresAt");
    }
    if (parseEntitlementValue(input.key, input.value) === undefined) {
      throw new AppError(400, ADMIN_ERRORS.invalidOverrideValue, "Value does not fit the key", {
        errors: [{ path: "value", code: ADMIN_ERRORS.invalidOverrideValue }],
      });
    }
    const created = await db.entitlementOverride.create({
      data: { salonId, key: input.key, value: input.value, expiresAt, reason, createdBy: actor },
    });
    return {
      before: null,
      after: overrideSnapshot(created),
      targetType: "entitlement_override",
      targetId: created.id,
    };
  }

  async revokeOverride(db: Db, salonId: string, overrideId: string): Promise<AdminChange> {
    const now = this.clock.now();
    const existing = await db.entitlementOverride.findUnique({
      where: { salonId_id: { salonId, id: overrideId } },
    });
    if (!existing) throw new AppError(404, "common.not_found", "Override not found");
    // Conditional update: a concurrent revoke (or expiry) makes this a no-op → 409.
    const { count } = await db.entitlementOverride.updateMany({
      where: {
        id: overrideId,
        salonId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { revokedAt: now },
    });
    if (count === 0) throw new AppError(409, ADMIN_ERRORS.overrideNotActive, "Override not active");
    return {
      before: overrideSnapshot(existing),
      after: overrideSnapshot({ ...existing, revokedAt: now }),
      targetType: "entitlement_override",
      targetId: overrideId,
    };
  }

  /** Manual founding-partner grant (source `admin_grant`); re-grants a revoked flag. */
  async grantFoundingPartner(db: Db, salonId: string): Promise<AdminChange> {
    const now = this.clock.now();
    const organizationId = await lockOrganization(db, salonId);
    const existing = await db.foundingPartner.findUnique({ where: { organizationId } });
    if (existing && !existing.revokedAt) {
      throw new AppError(409, ADMIN_ERRORS.foundingPartnerExists, "Already a founding partner");
    }
    const row = await db.foundingPartner.upsert({
      where: { organizationId },
      create: { organizationId, qualifiedAt: now, source: "admin_grant" },
      update: {
        qualifiedAt: now,
        source: "admin_grant",
        revokedAt: null,
        qualifyingSubscriptionId: null,
      },
    });
    return {
      before: existing ? foundingSnapshot(existing) : null,
      after: foundingSnapshot(row),
      targetType: "organization",
      targetId: organizationId,
      salonIds: await organizationSalons(db, organizationId),
    };
  }

  /** Revocation is super_admin only (R-FP2) — enforced by the route permission. */
  async revokeFoundingPartner(db: Db, salonId: string): Promise<AdminChange> {
    const now = this.clock.now();
    const organizationId = await lockOrganization(db, salonId);
    const existing = await db.foundingPartner.findUnique({ where: { organizationId } });
    // Conditional update: a concurrent revoke finds nothing to change → 409, never a second row.
    const { count } = await db.foundingPartner.updateMany({
      where: { organizationId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (!existing || count === 0) {
      throw new AppError(409, ADMIN_ERRORS.foundingPartnerMissing, "Not a founding partner");
    }
    return {
      before: foundingSnapshot(existing),
      after: foundingSnapshot({ ...existing, revokedAt: now }),
      targetType: "organization",
      targetId: organizationId,
      salonIds: await organizationSalons(db, organizationId),
    };
  }

  /**
   * R-FP3: a paid plan becoming active before the marketplace launch qualifies the organisation,
   * once (idempotent; a revoked flag is never re-set automatically). Same transaction as `→ active`.
   */
  private async qualifyFoundingPartner(
    db: Db,
    salonId: string,
    subscriptionId: string,
    now: Date,
  ): Promise<string[] | undefined> {
    const launch = this.config.marketplaceLaunchAt;
    if (launch && launch <= now) return undefined;
    const { organizationId } = await db.salon.findUniqueOrThrow({
      where: { id: salonId },
      select: { organizationId: true },
    });
    // INSERT … ON CONFLICT DO NOTHING: idempotent and race-free; never touches a revoked row.
    const { count } = await db.foundingPartner.createMany({
      data: {
        organizationId,
        qualifiedAt: now,
        source: "paid_before_launch",
        qualifyingSubscriptionId: subscriptionId,
      },
      skipDuplicates: true,
    });
    // Newly qualified: every salon of the organisation sees the flag in its read model.
    return count > 0 ? organizationSalons(db, organizationId) : undefined;
  }
}

/**
 * Creates the salon's current subscription. Two admins racing on a salon without one: the partial
 * unique index `subscriptions_one_current_per_salon` lets one win; the other gets a 409.
 */
async function createCurrent(
  db: Db,
  data: Prisma.SubscriptionUncheckedCreateInput,
): Promise<Subscription> {
  try {
    return await db.subscription.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError(409, SUBSCRIPTION_ERRORS.invalidTransition, "Changed concurrently", {
        cause: e,
      });
    }
    throw e;
  }
}

/** Serialises founding-partner changes per organisation (row lock on the organisation). */
async function lockOrganization(db: Db, salonId: string): Promise<string> {
  const [row] = await db.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM organizations o JOIN salons s ON s.organization_id = o.id
    WHERE s.id = ${salonId}::uuid
    FOR UPDATE OF o`;
  if (!row) throw new AppError(404, "common.not_found", "Salon not found");
  return row.id;
}

/** Every salon of the organisation: they all inherit the founding-partner flag. */
async function organizationSalons(db: Db, organizationId: string): Promise<string[]> {
  const salons = await db.salon.findMany({ where: { organizationId }, select: { id: true } });
  return salons.map((x) => x.id);
}

/** Locks the salon's current subscription row (at most one) for the rest of the transaction. */
async function lockCurrent(db: Db, salonId: string): Promise<Subscription | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM subscriptions
    WHERE salon_id = ${salonId}::uuid
      AND status::text = ANY(${[...CURRENT_STATUSES]}::text[])
    FOR UPDATE`;
  const id = rows[0]?.id;
  return id ? db.subscription.findUniqueOrThrow({ where: { id } }) : null;
}

async function planCode(db: Db, planId: string): Promise<string> {
  return (await db.plan.findUniqueOrThrow({ where: { id: planId }, select: { code: true } })).code;
}

async function snapshot(db: Db, s: Subscription): Promise<Snapshot> {
  return {
    id: s.id,
    plan: await planCode(db, s.planId),
    planVersion: s.planVersion,
    status: s.status,
    interval: s.interval,
    invoicingEntity: s.invoicingEntity,
    trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
    currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
    paidUntil: s.currentPeriodEnd?.toISOString() ?? null,
  };
}

function overrideSnapshot(o: EntitlementOverride): Snapshot {
  const value =
    o.key in ENTITLEMENT_KEYS ? parseEntitlementValue(o.key as EntitlementKey, o.value) : undefined;
  return {
    id: o.id,
    key: o.key,
    value: value ?? null,
    expiresAt: o.expiresAt?.toISOString() ?? null,
    revokedAt: o.revokedAt?.toISOString() ?? null,
  };
}

function foundingSnapshot(f: FoundingPartner): Snapshot {
  return {
    organizationId: f.organizationId,
    source: f.source,
    qualifiedAt: f.qualifiedAt.toISOString(),
    revokedAt: f.revokedAt?.toISOString() ?? null,
  };
}

function invalidDate(path: string): AppError {
  return new AppError(400, ADMIN_ERRORS.invalidDate, "Date out of range", {
    errors: [{ path, code: ADMIN_ERRORS.invalidDate }],
  });
}
