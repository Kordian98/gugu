import { SALON_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";

type Db = Pick<Prisma.TransactionClient, "salonSetup">;

/**
 * q103: a salon from the email-only signup has no name until its first setup step. Anything that
 * shows the salon's name to someone else (Zalo OA connect, team invitations, setup steps) refuses
 * with 409 `salon.name_required` until then. Salons without a setup row are always named.
 */
export async function assertSalonNamed(db: Db, salonId: string): Promise<void> {
  const setup = await db.salonSetup.findUnique({
    where: { salonId },
    select: { nameConfirmed: true },
  });
  if (setup && !setup.nameConfirmed) {
    throw new AppError(409, SALON_ERRORS.nameRequired, "Name the salon first");
  }
}
