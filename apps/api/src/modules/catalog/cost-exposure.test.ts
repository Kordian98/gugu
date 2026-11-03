// Guard: internal service costs (services.cost.read) must never reach customer-facing, Zalo or AI
// assistant code paths. Only the catalogue (gated DTO), insights (gated margin) and payroll
// (commission base "price minus cost" and the profit view, payroll.read ⇒ services.cost.read,
// asserted in packages/domain permissions.test.ts) may read them.
// Payroll SELF-views (payroll.self.read: `payroll/me`, `payroll/me/lines`) are open to every role,
// so they must carry no cost-derived value either: no `price`/`base` pair (price − base = cost
// under price_minus_cost) and no cost field. Their DTO keys are pinned below.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { myCommissionLineSchema, myCommissionLinesSchema, myEarningsSchema } from "@gugu/contracts";

const ROOT = join(__dirname, "..", "..", "..");
const ALLOWED = [
  "src/modules/catalog/",
  "src/modules/insights/",
  "src/modules/salon-crm/payroll", // payroll/ and payroll.int.test.ts
  "src/infrastructure/prisma/generated/",
];
const SCAN = ["src", join("..", "..", "packages", "contracts", "src", "assistant")];
const COST = /cost_amount_minor|costAmountMinor|extraCostAmountMinor|extra_cost_amount_minor/;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) ? [p] : [];
  });

describe("internal cost exposure", () => {
  it("only catalog and insights read cost columns", () => {
    const offenders = SCAN.flatMap((d) => files(join(ROOT, d)))
      .map((p) => relative(ROOT, p))
      .filter((p) => !ALLOWED.some((a) => p.startsWith(a)) && !p.endsWith("cost-exposure.test.ts"))
      .filter((p) => COST.test(readFileSync(join(ROOT, p), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("payroll self-views carry no cost-derived values", () => {
  const forbidden = /^(price|base|cost|.*Cost|margin|employer.*|realCost|gross)$/;
  it("own commission lines: rate and amount only, no price or base", () => {
    const keys = Object.keys(myCommissionLineSchema.shape);
    expect(keys.sort()).toEqual(
      ["amount", "bookingId", "date", "lineId", "rate", "service", "state"].sort(),
    );
    expect(Object.keys(myCommissionLinesSchema.shape).sort()).toEqual(["items", "month"]);
    expect(keys.filter((k) => forbidden.test(k))).toEqual([]);
  });
  it("own earnings: no service cost, employer cost or real cost", () => {
    const keys = Object.keys(myEarningsSchema.shape);
    // `base` here is the person's own base PAY, not a commission base.
    expect(keys.filter((k) => k !== "base" && forbidden.test(k))).toEqual([]);
  });
});
