-- CreateEnum
CREATE TYPE "base_pay_type" AS ENUM ('none', 'monthly', 'daily', 'hourly');

-- CreateEnum
CREATE TYPE "commission_base" AS ENUM ('price_after_discount', 'price_minus_cost');

-- CreateEnum
CREATE TYPE "commission_rate_kind" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "payroll_adjustment_kind" AS ENUM ('bonus', 'deduction', 'advance');

-- CreateEnum
CREATE TYPE "salon_cost_category" AS ENUM ('rent', 'utilities', 'products', 'marketing', 'other');

-- CreateTable
CREATE TABLE "staff_pay_settings" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "base_type" "base_pay_type" NOT NULL,
    "base_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "commission_bps" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_pay_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_commission_overrides" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "pay_setting_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "variant_id" UUID,
    "kind" "commission_rate_kind" NOT NULL,
    "bps" INTEGER,
    "amount_minor" BIGINT,

    CONSTRAINT "staff_commission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_commission_policies" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "base" "commission_base" NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salon_commission_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "kind" "payroll_adjustment_kind" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_user_id" UUID,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_months" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_user_id" UUID,
    "reopened_at" TIMESTAMPTZ(6),
    "reopened_by_user_id" UUID,
    "snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payouts" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "payroll_month_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "marked_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_costs" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "salon_cost_category" NOT NULL DEFAULT 'other',
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "start_month" DATE NOT NULL,
    "end_month" DATE,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "salon_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_pay_settings_salon_id_id_key" ON "staff_pay_settings"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_pay_settings_salon_id_staff_id_effective_from_key" ON "staff_pay_settings"("salon_id", "staff_id", "effective_from");

-- CreateIndex
CREATE INDEX "staff_commission_overrides_salon_id_pay_setting_id_idx" ON "staff_commission_overrides"("salon_id", "pay_setting_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_commission_overrides_salon_id_id_key" ON "staff_commission_overrides"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_commission_policies_salon_id_id_key" ON "salon_commission_policies"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_commission_policies_salon_id_effective_from_key" ON "salon_commission_policies"("salon_id", "effective_from");

-- CreateIndex
CREATE INDEX "payroll_adjustments_salon_id_month_idx" ON "payroll_adjustments"("salon_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_adjustments_salon_id_id_key" ON "payroll_adjustments"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_months_salon_id_id_key" ON "payroll_months"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_months_salon_id_month_key" ON "payroll_months"("salon_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payouts_salon_id_id_key" ON "payroll_payouts"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payouts_payroll_month_id_staff_id_key" ON "payroll_payouts"("payroll_month_id", "staff_id");

-- CreateIndex
CREATE INDEX "salon_costs_salon_id_start_month_idx" ON "salon_costs"("salon_id", "start_month");

-- CreateIndex
CREATE UNIQUE INDEX "salon_costs_salon_id_id_key" ON "salon_costs"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "staff_pay_settings" ADD CONSTRAINT "staff_pay_settings_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_commission_overrides" ADD CONSTRAINT "staff_commission_overrides_salon_id_pay_setting_id_fkey" FOREIGN KEY ("salon_id", "pay_setting_id") REFERENCES "staff_pay_settings"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_commission_overrides" ADD CONSTRAINT "staff_commission_overrides_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_commission_overrides" ADD CONSTRAINT "staff_commission_overrides_salon_id_variant_id_fkey" FOREIGN KEY ("salon_id", "variant_id") REFERENCES "service_variants"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_commission_policies" ADD CONSTRAINT "salon_commission_policies_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_months" ADD CONSTRAINT "payroll_months_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_salon_id_payroll_month_id_fkey" FOREIGN KEY ("salon_id", "payroll_month_id") REFERENCES "payroll_months"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_costs" ADD CONSTRAINT "salon_costs_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Raw objects (ADR-0008 inventory: prisma/raw-objects.json) ----------------------------------

-- A percentage override carries bps (0–100 %), a fixed one a non-negative amount; never both.
ALTER TABLE "staff_commission_overrides" ADD CONSTRAINT "staff_commission_overrides_valid" CHECK (
  (kind = 'percent' AND bps BETWEEN 0 AND 10000 AND amount_minor IS NULL)
  OR (kind = 'fixed' AND amount_minor >= 0 AND bps IS NULL)
);
-- One override per service (variant NULL) or per variant inside a pay version.
CREATE UNIQUE INDEX "staff_commission_overrides_one_per_target"
  ON "staff_commission_overrides" (pay_setting_id, service_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "staff_pay_settings" ADD CONSTRAINT "staff_pay_settings_valid" CHECK (
  base_amount_minor >= 0 AND commission_bps BETWEEN 0 AND 10000
  AND (base_type <> 'none' OR base_amount_minor = 0)
);

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_valid" CHECK (
  amount_minor > 0 AND length(btrim(reason)) BETWEEN 1 AND 300
  AND extract(day FROM month) = 1
);

ALTER TABLE "payroll_months" ADD CONSTRAINT "payroll_months_first_day" CHECK (extract(day FROM month) = 1);

ALTER TABLE "salon_costs" ADD CONSTRAINT "salon_costs_valid" CHECK (
  amount_minor >= 0 AND length(btrim(name)) BETWEEN 1 AND 80
  AND extract(day FROM start_month) = 1
  AND (end_month IS NULL OR (extract(day FROM end_month) = 1 AND end_month >= start_month))
  AND (recurring OR end_month IS NULL)
);
