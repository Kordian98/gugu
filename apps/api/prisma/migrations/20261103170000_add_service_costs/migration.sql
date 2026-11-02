-- AlterTable
ALTER TABLE "service_addons" ADD COLUMN     "extra_cost_amount_minor" BIGINT;

-- AlterTable
ALTER TABLE "service_variants" ADD COLUMN     "cost_amount_minor" BIGINT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "cost_amount_minor" BIGINT;
