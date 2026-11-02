import { Injectable } from "@nestjs/common";
import {
  type StartTrialInput,
  type SubscriptionStatus,
  type SubscriptionSummary,
  SUBSCRIPTION_ERRORS,
  TRIAL_DAYS,
  planCodeSchema,
} from "@gugu/contracts";
import { RequestContext } from "../../../common/context/request-context";
import { AppError } from "../../../common/problem/app-error";
import {
  Prisma,
  type Plan,
  type Subscription,
} from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { canTransition } from "../domain/subscription-status";
import { Clock } from "./clock";
import { EntitlementService } from "./entitlement.service";

type Db = Prisma.TransactionClient;
const DAY_MS = 86_400_000;

/**
 * Public entry point of the subscriptions module for other modules (export only this and
 * EntitlementService). Methods accept the caller's transaction so salon registration (topic 05)
 * can create the salon and its trial atomically.
 */
@Injectable()
export class SubscriptionsFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly entitlements: EntitlementService,
  ) {}

  /** Contract: @gugu/contracts `startTrialInputSchema` (14-day trial, Pro features, Basic limits). */
  async startTrial(input: StartTrialInput, tx?: Db): Promise<SubscriptionSummary> {
    const run = async (db: Db): Promise<SubscriptionSummary> => {
      const existing = await db.subscription.findMany({
        where: { salonId: input.salonId },
        include: { plan: true },
      });
      const current = existing.find((s) => s.status === "trialing" && s.plan.code === "trial");
      if (current) return summary(current);
      if (existing.length > 0) throw trialUnavailable();
      const plan = await db.plan.findUniqueOrThrow({ where: { code: "trial" } });
      const now = this.clock.now();
      const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
      try {
        const created = await db.subscription.create({
          data: {
            salonId: input.salonId,
            planId: plan.id,
            planVersion: plan.version,
            status: "trialing",
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            events: {
              create: {
                fromStatus: null,
                toStatus: "trialing",
                actor: actor(),
                reason: "trial_started",
              },
            },
          },
          include: { plan: true },
        });
        return summary(created);
      } catch (e) {
        // Concurrent start for the same salon: the partial unique index lets exactly one win.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw trialUnavailable(e);
        }
        throw e;
      }
    };
    const result = tx ? await run(tx) : await this.prisma.$transaction(run);
    await this.entitlements.invalidate(input.salonId);
    return result;
  }

  /** Moves a subscription along the state machine and records the change in its history. */
  async transition(
    params: { salonId: string; subscriptionId: string; to: SubscriptionStatus; reason: string },
    tx?: Db,
  ): Promise<SubscriptionSummary> {
    const run = async (db: Db): Promise<SubscriptionSummary> => {
      const sub = await db.subscription.findUnique({
        where: { salonId_id: { salonId: params.salonId, id: params.subscriptionId } },
      });
      if (!sub) throw new AppError(404, "common.not_found", "Subscription not found");
      if (!canTransition(sub.status, params.to)) {
        throw new AppError(409, SUBSCRIPTION_ERRORS.invalidTransition, "Transition not allowed", {
          detail: `${sub.status} -> ${params.to}`,
        });
      }
      // Conditional update: a concurrent transition from the same status makes this a no-op.
      const { count } = await db.subscription.updateMany({
        where: { id: sub.id, salonId: sub.salonId, status: sub.status },
        data: { status: params.to },
      });
      if (count === 0) {
        throw new AppError(
          409,
          SUBSCRIPTION_ERRORS.invalidTransition,
          "Subscription changed concurrently",
        );
      }
      await db.subscriptionEvent.create({
        data: {
          salonId: sub.salonId,
          subscriptionId: sub.id,
          fromStatus: sub.status,
          toStatus: params.to,
          actor: actor(),
          reason: params.reason,
        },
      });
      return summary(
        await db.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { plan: true } }),
      );
    };
    const result = tx ? await run(tx) : await this.prisma.$transaction(run);
    await this.entitlements.invalidate(params.salonId);
    return result;
  }

  /**
   * Writes `trialing → expired` for trials past their end. Access does not depend on this (reads
   * use the effective status); it keeps stored state and history accurate. Returns the count.
   */
  async expireDueTrials(): Promise<number> {
    const due = await this.prisma.subscription.findMany({
      where: { status: "trialing", trialEndsAt: { lte: this.clock.now() } },
      select: { id: true, salonId: true },
    });
    let expired = 0;
    for (const sub of due) {
      try {
        await this.transition({
          ...sub,
          subscriptionId: sub.id,
          to: "expired",
          reason: "trial_ended",
        });
        expired++;
      } catch (e) {
        if (!(e instanceof AppError && e.code === SUBSCRIPTION_ERRORS.invalidTransition)) throw e;
      }
    }
    return expired;
  }
}

function summary(sub: Subscription & { plan: Plan }): SubscriptionSummary {
  return {
    id: sub.id,
    salonId: sub.salonId,
    plan: planCodeSchema.parse(sub.plan.code),
    status: sub.status,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
  };
}

function actor(): string {
  const a = RequestContext.current()?.actor;
  return a && a.type !== "anonymous" ? `${a.type}:${a.id}` : "system";
}

function trialUnavailable(cause?: unknown): AppError {
  return new AppError(
    409,
    SUBSCRIPTION_ERRORS.trialUnavailable,
    "Salon already has or had a subscription",
    {
      cause,
    },
  );
}
