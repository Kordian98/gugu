import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { type LimitValue, SUBSCRIPTION_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { RedisService } from "../../../infrastructure/redis/redis.service";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";

export interface CostReservation {
  id: string;
  salonId: string;
  amountVnd: number;
}

/**
 * Hard monthly AI cost cap per salon (`ai.monthly_cost_cap_vnd`, q32/q73): reserve the worst case
 * before every LLM call, commit the actual cost after it, release on failure before the call.
 *
 * TODO(12): replace with topic 12's `UsageService` (`ai.cost` usage key, ledger rows with unit cost
 * and FX rate) once it lands; keep this interface so callers do not change.
 */
export abstract class AiCostMeter {
  abstract usage(salonId: string): Promise<{ usedVnd: number; capVnd: LimitValue }>;
  /** Throws `entitlement.quota_exceeded` (429) when the reservation would pass the cap. */
  abstract reserve(salonId: string, amountVnd: number): Promise<CostReservation>;
  abstract commit(reservation: CostReservation, actualVnd: number): Promise<void>;
  abstract release(reservation: CostReservation): Promise<void>;
}

const MONTH_TTL_SECONDS = 40 * 24 * 3600;
const RESERVATION_TTL_SECONDS = 3600;

/** used + amount ≤ cap → INCRBY; atomic so parallel imports cannot overshoot. */
const RESERVE = `
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
if cap >= 0 and used + amount > cap then return -1 end
redis.call('INCRBY', KEYS[1], amount)
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[4])
return used + amount`;

/** Replace the reserved amount by the actual one; idempotent (the reservation key is consumed). */
const SETTLE = `
local reserved = redis.call('GET', KEYS[2])
if not reserved then return 0 end
redis.call('DEL', KEYS[2])
redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]) - tonumber(reserved))
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1`;

/** Interim Redis implementation of the cap (counter per salon per calendar month, UTC+7). */
@Injectable()
export class RedisAiCostMeter extends AiCostMeter {
  constructor(
    private readonly redis: RedisService,
    private readonly entitlements: EntitlementService,
  ) {
    super();
  }

  async usage(salonId: string) {
    const [used, capVnd] = await Promise.all([
      this.redis.client.get(this.monthKey(salonId)),
      this.entitlements.limit(salonId, "ai.monthly_cost_cap_vnd"),
    ]);
    return { usedVnd: Math.max(0, Number(used ?? 0)), capVnd };
  }

  async reserve(salonId: string, amountVnd: number): Promise<CostReservation> {
    const cap = await this.entitlements.limit(salonId, "ai.monthly_cost_cap_vnd");
    const id = randomUUID();
    const result = (await this.redis.client.eval(
      RESERVE,
      2,
      this.monthKey(salonId),
      this.reservationKey(salonId, id),
      String(amountVnd),
      String(cap === "unlimited" ? -1 : cap),
      String(MONTH_TTL_SECONDS),
      String(RESERVATION_TTL_SECONDS),
    )) as number;
    if (result < 0) {
      throw new AppError(429, SUBSCRIPTION_ERRORS.quotaExceeded, "Monthly AI cost cap reached", {
        errors: [{ path: "ai.monthly_cost_cap_vnd", code: SUBSCRIPTION_ERRORS.quotaExceeded }],
      });
    }
    return { id, salonId, amountVnd };
  }

  async commit(r: CostReservation, actualVnd: number): Promise<void> {
    await this.settle(r, Math.max(0, Math.ceil(actualVnd)));
  }

  async release(r: CostReservation): Promise<void> {
    await this.settle(r, 0);
  }

  private async settle(r: CostReservation, amount: number) {
    await this.redis.client.eval(
      SETTLE,
      2,
      this.monthKey(r.salonId),
      this.reservationKey(r.salonId, r.id),
      String(amount),
      String(MONTH_TTL_SECONDS),
    );
  }

  /** Overridable in tests. */
  protected now(): Date {
    return new Date();
  }

  /** Calendar month in Asia/Ho_Chi_Minh (UTC+7, no DST). */
  private monthKey(salonId: string): string {
    const local = new Date(this.now().getTime() + 7 * 3600_000);
    const month = `${String(local.getUTCFullYear())}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
    return `ai:cost:v1:${salonId}:${month}`;
  }

  private reservationKey(salonId: string, id: string): string {
    return `ai:cost:v1:res:${salonId}:${id}`;
  }
}
