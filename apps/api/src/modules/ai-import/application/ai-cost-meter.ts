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
  /**
   * Counter the reservation was taken from (calendar month at reserve time). Settling always goes
   * back to this counter, so a reservation made at 23:59 on the last day settles in that month.
   */
  monthKey: string;
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
  /**
   * Metered spend per salon for one calendar month (`YYYY-MM`, Asia/Ho_Chi_Minh), for platform
   * admin reporting. Salons without spend are 0. Counters live ~40 days, so only the current and
   * the previous month are meaningful.
   */
  abstract monthlyUsage(salonIds: readonly string[], month: string): Promise<Map<string, number>>;
}

/** Calendar month (`YYYY-MM`) of `at` in Asia/Ho_Chi_Minh (UTC+7, no DST): the cap period. */
export function aiCostMonth(at: Date): string {
  const local = new Date(at.getTime() + 7 * 3600_000);
  return `${String(local.getUTCFullYear())}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
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

/**
 * Replace the reserved amount by the actual one on the reservation's own month counter; idempotent
 * (the reservation key is consumed) and never below 0 (e.g. a counter that expired meanwhile).
 */
const SETTLE = `
local reserved = redis.call('GET', KEYS[2])
if not reserved then return 0 end
redis.call('DEL', KEYS[2])
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local next = used + tonumber(ARGV[1]) - tonumber(reserved)
if next < 0 then next = 0 end
redis.call('SET', KEYS[1], next, 'EX', ARGV[2])
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
    const monthKey = this.monthKey(salonId);
    const result = (await this.redis.client.eval(
      RESERVE,
      2,
      monthKey,
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
    return { id, salonId, amountVnd, monthKey };
  }

  async commit(r: CostReservation, actualVnd: number): Promise<void> {
    // Actual spend is recorded even if it exceeds the estimate, so the cap never hides real cost.
    await this.settle(r, Math.max(0, Math.ceil(actualVnd)));
  }

  async release(r: CostReservation): Promise<void> {
    await this.settle(r, 0);
  }

  async monthlyUsage(salonIds: readonly string[], month: string): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (salonIds.length === 0) return result;
    const values = await this.redis.client.mget(...salonIds.map((id) => this.key(id, month)));
    salonIds.forEach((id, i) => result.set(id, Math.max(0, Number(values[i] ?? 0))));
    return result;
  }

  private async settle(r: CostReservation, amount: number) {
    await this.redis.client.eval(
      SETTLE,
      2,
      r.monthKey,
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
  protected monthKey(salonId: string): string {
    return this.key(salonId, aiCostMonth(this.now()));
  }

  private key(salonId: string, month: string): string {
    return `ai:cost:v1:${salonId}:${month}`;
  }

  private reservationKey(salonId: string, id: string): string {
    return `ai:cost:v1:res:${salonId}:${id}`;
  }
}
