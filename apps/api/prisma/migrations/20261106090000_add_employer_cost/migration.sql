-- "Chi phí thực tế" per pay version (owner request 2026-11-03, ADR-0017): employer cost on top
-- of gross pay, entered by the salon. Effective-dated with the rest of the pay version.
ALTER TABLE "staff_pay_settings" ADD COLUMN "employer_cost_bps" INTEGER,
ADD COLUMN "employer_cost_amount_minor" BIGINT;

-- At most one mode; a % is 0–100 %, an amount is a non-negative VND figure.
ALTER TABLE "staff_pay_settings" ADD CONSTRAINT "staff_pay_settings_employer_cost_valid" CHECK (
  (employer_cost_bps IS NULL OR employer_cost_amount_minor IS NULL)
  AND (employer_cost_bps IS NULL OR employer_cost_bps BETWEEN 0 AND 10000)
  AND (employer_cost_amount_minor IS NULL OR employer_cost_amount_minor BETWEEN 0 AND 10000000000)
);
