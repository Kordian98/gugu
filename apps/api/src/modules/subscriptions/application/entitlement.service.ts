import { Inject, Injectable } from "@nestjs/common";
import {
  type BooleanEntitlementKey,
  type EntitlementKey,
  type EntitlementValue,
  type LimitEntitlementKey,
  type LimitValue,
  planCodeSchema,
  type SalonEntitlements,
  SUBSCRIPTION_ERRORS,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { resolveEntitlements } from "../domain/resolve-entitlements";
import { effectiveStatus, isCurrent } from "../domain/subscription-status";
import { Clock } from "./clock";
import {
  ENTITLEMENT_CACHE,
  ENTITLEMENT_CACHE_TTL_SECONDS,
  type EntitlementCache,
} from "./entitlement-cache";

/**
 * Resolves what a salon may use (skill `entitlements`). Every backend entry point — HTTP guard,
 * jobs, agent tools, webhooks — goes through here; client-side gating is display only.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(ENTITLEMENT_CACHE) private readonly cache: EntitlementCache,
  ) {}

  async forSalon(salonId: string): Promise<SalonEntitlements> {
    const cached = await this.cache.get(salonId);
    if (cached) return cached;
    const now = this.clock.now();
    const [subscription, overrides] = await Promise.all([
      // The newest subscription is the current one if any is current (at most one, and a new one
      // is only created after the previous ended); otherwise it tells us why access ended.
      this.prisma.subscription.findFirst({
        where: { salonId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { plan: { include: { entitlements: { select: { key: true, value: true } } } } },
      }),
      this.prisma.entitlementOverride.findMany({
        where: { salonId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { key: true, value: true, expiresAt: true, revokedAt: true, createdAt: true },
      }),
    ]);
    const status = subscription ? effectiveStatus(subscription, now) : "none";
    const granting = subscription !== null && status !== "none" && isCurrent(status);
    const result: SalonEntitlements = {
      salonId,
      plan: subscription ? planCodeSchema.parse(subscription.plan.code) : null,
      status,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      entitlements: resolveEntitlements(
        granting ? subscription.plan.entitlements : null,
        overrides,
        now,
      ),
    };
    // A salon without a subscription is about to get one (registration → startTrial); never cache
    // that state, and never cache a trial beyond its end.
    if (subscription) {
      const untilTrialEnd = subscription.trialEndsAt
        ? Math.floor((subscription.trialEndsAt.getTime() - now.getTime()) / 1000)
        : Number.POSITIVE_INFINITY;
      const ttl = Math.min(ENTITLEMENT_CACHE_TTL_SECONDS, untilTrialEnd);
      if (ttl > 0) await this.cache.set(salonId, result, ttl);
    }
    return result;
  }

  async get<K extends EntitlementKey>(salonId: string, key: K): Promise<EntitlementValue<K>> {
    return (await this.forSalon(salonId)).entitlements[key] as EntitlementValue<K>;
  }

  async isEnabled(salonId: string, key: BooleanEntitlementKey): Promise<boolean> {
    return this.get(salonId, key);
  }

  async limit(salonId: string, key: LimitEntitlementKey): Promise<LimitValue> {
    return this.get(salonId, key);
  }

  /** Throws 403 `entitlement.required` unless the boolean key is granted. */
  async assert(salonId: string, key: BooleanEntitlementKey): Promise<void> {
    if (!(await this.isEnabled(salonId, key))) {
      throw new AppError(
        403,
        SUBSCRIPTION_ERRORS.entitlementRequired,
        "Plan does not include this feature",
        {
          detail: key,
        },
      );
    }
  }

  /** Call after any change to a salon's subscription or overrides. */
  async invalidate(salonId: string): Promise<void> {
    await this.cache.delete(salonId);
  }
}
