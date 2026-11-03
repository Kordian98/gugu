import { Inject, Injectable } from "@nestjs/common";
import {
  type BooleanEntitlementKey,
  type EntitlementKey,
  type EntitlementValue,
  FOUNDING_WAIVER_MONTHS,
  type LimitEntitlementKey,
  type LimitValue,
  planCodeSchema,
  type SalonEntitlements,
  SUBSCRIPTION_ERRORS,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
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
    private readonly config?: AppConfig,
  ) {}

  async forSalon(salonId: string): Promise<SalonEntitlements> {
    const cached = await this.cache.get(salonId);
    if (cached) return cached;
    const now = this.clock.now();
    const [subscription, overrides, salon] = await this.load(salonId, now);
    const status = subscription ? effectiveStatus(subscription, now) : "none";
    // A suspended salon gets nothing, overrides included (platform admin suspension, M12.6).
    const suspended = salon?.status === "suspended";
    const granting = subscription !== null && status !== "none" && isCurrent(status) && !suspended;
    const result: SalonEntitlements = {
      salonId,
      plan: subscription ? planCodeSchema.parse(subscription.plan.code) : null,
      status,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      suspended,
      foundingPartner: this.foundingPartner(salon?.organization.foundingPartner ?? null),
      entitlements: resolveEntitlements(
        granting ? subscription.plan.entitlements : null,
        suspended ? [] : overrides,
        now,
      ),
    };
    // A salon without a subscription is about to get one (registration → startTrial); never cache
    // that state, and never cache a trial beyond its end.
    if (subscription) {
      const ttl = cacheTtl(
        [subscription.trialEndsAt, ...overrides.map((o) => o.expiresAt)],
        now,
      );
      if (ttl > 0) await this.cache.set(salonId, result, ttl);
    }
    return result;
  }

  private load(salonId: string, now: Date) {
    return Promise.all([
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
      this.prisma.salon.findUnique({
        where: { id: salonId },
        select: {
          status: true,
          organization: {
            select: { foundingPartner: { select: { qualifiedAt: true, revokedAt: true } } },
          },
        },
      }),
    ]);
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

  private foundingPartner(
    row: { qualifiedAt: Date; revokedAt: Date | null } | null,
  ): SalonEntitlements["foundingPartner"] {
    if (!row || row.revokedAt) return null;
    return { since: row.qualifiedAt.toISOString(), waiverEndsAt: this.waiverEnd() };
  }

  /** R-FP4: computed, never stored, so it follows the launch date until launch. */
  private waiverEnd(): string | null {
    const launch = this.config?.marketplaceLaunchAt;
    if (!launch) return null;
    const end = new Date(launch);
    end.setUTCMonth(end.getUTCMonth() + FOUNDING_WAIVER_MONTHS);
    return end.toISOString();
  }

  /** Call after any change to a salon's subscription, overrides, suspension or founding flag. */
  async invalidate(salonId: string): Promise<void> {
    await this.cache.delete(salonId);
  }
}

/**
 * Seconds to cache: ≤ the TTL and never beyond the earliest boundary at which the resolved
 * entitlements change on their own — a trial's end or the expiry of an active override.
 * A boundary at or before `now` yields 0 (do not cache).
 */
export function cacheTtl(boundaries: readonly (Date | null)[], now: Date): number {
  let ttl = ENTITLEMENT_CACHE_TTL_SECONDS;
  for (const at of boundaries) {
    if (!at) continue;
    ttl = Math.min(ttl, Math.floor((at.getTime() - now.getTime()) / 1000));
  }
  return Math.max(ttl, 0);
}
