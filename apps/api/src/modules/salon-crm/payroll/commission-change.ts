import type { CommissionBulkInput, CommissionOverride } from "@gugu/contracts";

export type VersionFields = {
  commissionPercent: number;
  overrides: CommissionOverride[];
};

type Change = CommissionBulkInput["change"];

const sameTarget = (
  o: { serviceId: string; variantId: string | null },
  t: { serviceId: string; variantId?: string | null | undefined },
) => o.serviceId === t.serviceId && (o.variantId ?? null) === (t.variantId ?? null);

/**
 * One bulk commission change applied to one pay version (pure): the default % is replaced, or the
 * own rate of each listed service/variant is set (replacing an existing one) or removed. Base pay
 * and every other override stay as they are.
 */
export function applyCommissionChange(v: VersionFields, change: Change): VersionFields {
  if (change.target === "default") {
    return { commissionPercent: change.percent, overrides: v.overrides };
  }
  const kept = v.overrides.filter((o) => !change.services.some((s) => sameTarget(o, s)));
  const rate = change.rate;
  if (rate === null) return { commissionPercent: v.commissionPercent, overrides: kept };
  const added: CommissionOverride[] = change.services.map((s) => ({
    serviceId: s.serviceId,
    variantId: s.variantId ?? null,
    kind: rate.kind,
    percent: rate.kind === "percent" ? rate.percent : null,
    amount: rate.kind === "fixed" ? rate.amount : null,
  }));
  return { commissionPercent: v.commissionPercent, overrides: [...kept, ...added] };
}
