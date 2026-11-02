import { RESOURCE_ERRORS, type ResourceRequirement } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";

type Tx = Prisma.TransactionClient;

/**
 * Replaces the resource types a service needs (M6.6). Exported through the bookings facade so the
 * catalog's service editor saves requirements in the same transaction as the service. Caller
 * bumps `availability_version`.
 */
export async function replaceServiceResourceRequirements(
  tx: Tx,
  salonId: string,
  serviceId: string,
  items: readonly ResourceRequirement[],
): Promise<void> {
  const typeIds = [...new Set(items.map((i) => i.resourceTypeId))];
  if (typeIds.length > 0) {
    const found = await tx.resourceType.count({
      where: { salonId, id: { in: typeIds }, deletedAt: null },
    });
    if (found !== typeIds.length) {
      throw new AppError(422, RESOURCE_ERRORS.typeNotFound, "Unknown resource type", {
        errors: [{ path: "resourceRequirements", code: RESOURCE_ERRORS.typeNotFound }],
      });
    }
  }
  await tx.serviceResourceRequirement.deleteMany({
    where: { salonId, serviceId, resourceTypeId: { notIn: typeIds } },
  });
  for (const item of items) {
    await tx.serviceResourceRequirement.upsert({
      where: { serviceId_resourceTypeId: { serviceId, resourceTypeId: item.resourceTypeId } },
      create: { salonId, serviceId, resourceTypeId: item.resourceTypeId, quantity: item.quantity },
      update: { quantity: item.quantity },
    });
  }
}
