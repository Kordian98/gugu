-- CreateEnum
CREATE TYPE "founding_partner_source" AS ENUM ('paid_before_launch', 'admin_grant');

-- AlterTable
ALTER TABLE "salons" ADD COLUMN     "pre_suspension_status" "salon_status",
ADD COLUMN     "suspended_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "subscription_events" ADD COLUMN     "from_plan_code" TEXT,
ADD COLUMN     "to_plan_code" TEXT;

-- CreateTable
CREATE TABLE "founding_partners" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "qualified_at" TIMESTAMPTZ(6) NOT NULL,
    "source" "founding_partner_source" NOT NULL,
    "qualifying_subscription_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "founding_partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "founding_partners_organization_id_key" ON "founding_partners"("organization_id");

-- AddForeignKey
ALTER TABLE "founding_partners" ADD CONSTRAINT "founding_partners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Platform admin (topic 12 M12.6). A suspended salon always has a suspension time and a status to
-- restore; an unsuspended one has neither.
ALTER TABLE "salons" ADD CONSTRAINT "salons_suspension_consistent" CHECK (
  ("status" = 'suspended') = ("suspended_at" IS NOT NULL)
  AND ("suspended_at" IS NULL) = ("pre_suspension_status" IS NULL)
  AND ("pre_suspension_status" IS NULL OR "pre_suspension_status" <> 'suspended')
);
