// Guard: internal service costs (services.cost.read) must never reach customer-facing, Zalo or AI
// assistant code paths. Only the catalogue (gated DTO), insights (gated margin) and payroll
// (commission base "price minus cost" and the profit view, payroll.read ⇒ services.cost.read,
// asserted in packages/domain permissions.test.ts) may read them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const ALLOWED = [
  "src/modules/catalog/",
  "src/modules/insights/",
  "src/modules/salon-crm/payroll/",
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
