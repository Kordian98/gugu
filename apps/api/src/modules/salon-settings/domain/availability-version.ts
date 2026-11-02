import type { Prisma } from "../../../infrastructure/prisma/generated/client";

/**
 * Bumps `salon_settings.availability_version` (06 G19 cache key). Call inside the transaction of
 * every write that changes what can be booked: hours, holidays, schedules, breaks, time off,
 * services, variants, add-ons, staff assignments. Creates the settings row when missing.
 */
export async function bumpAvailabilityVersion(
  tx: Prisma.TransactionClient,
  salonId: string,
): Promise<void> {
  await tx.salonSettings.upsert({
    where: { salonId },
    create: { salonId, availabilityVersion: 1 },
    update: { availabilityVersion: { increment: 1 } },
  });
}
