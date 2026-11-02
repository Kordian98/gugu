import type { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { createSalonFixture, type SalonFixture } from "./identity";

/** `time(0)` column value for "HH:MM". */
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

export interface BookableSalonFixture extends SalonFixture {
  slug: string;
  serviceId: string;
  variantId: string;
  addOnId: string;
  staffIds: [string, string];
}

/**
 * A live salon (Asia/Ho_Chi_Minh) open 09:00–18:00 every day, two bookable staff working 09–18,
 * one 30-minute service (10-minute after-buffer) with a variant and a +15-minute add-on.
 * Settings: no lead time, 15-minute grid, 60-day window, defaults otherwise.
 */
export async function createBookableSalon(
  prisma: PrismaService,
  settings: Record<string, unknown> = {},
): Promise<BookableSalonFixture> {
  const base = await createSalonFixture(prisma, "Booking Salon");
  const salon = await prisma.salon.update({
    where: { id: base.salonId },
    data: { status: "active" },
    select: { slug: true },
  });
  const { salonId } = base;
  await prisma.salonSettings.upsert({
    where: { salonId },
    create: { salonId, minLeadTimeMinutes: 0, ...settings },
    update: { minLeadTimeMinutes: 0, ...settings },
  });
  await prisma.salonOpeningHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      salonId,
      weekday,
      opensAt: time("09:00"),
      closesAt: time("18:00"),
    })),
  });
  const staffIds: string[] = [];
  for (const [i, name] of ["Linh", "Mai"].entries()) {
    const staff = await prisma.staffProfile.create({
      data: { salonId, displayName: name, sortOrder: i },
    });
    staffIds.push(staff.id);
    await prisma.staffSchedule.createMany({
      data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        salonId,
        staffId: staff.id,
        weekday,
        startsAt: time("09:00"),
        endsAt: time("18:00"),
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      })),
    });
  }
  const service = await prisma.service.create({
    data: {
      salonId,
      name: { vi: "Sơn gel", en: "Gel polish" },
      priceAmountMinor: 200_000n,
      durationMinutes: 30,
      bufferAfterMinutes: 10,
    },
  });
  const variant = await prisma.serviceVariant.create({
    data: {
      salonId,
      serviceId: service.id,
      name: { vi: "Dài", en: "Long" },
      durationMinutes: 45,
      priceAmountMinor: 250_000n,
    },
  });
  const addOn = await prisma.serviceAddOn.create({
    data: {
      salonId,
      serviceId: service.id,
      name: { vi: "Tháo gel", en: "Gel removal" },
      extraDurationMinutes: 15,
      extraPriceAmountMinor: 50_000n,
    },
  });
  await prisma.staffService.createMany({
    data: staffIds.map((staffId) => ({ salonId, staffId, serviceId: service.id })),
  });
  return {
    ...base,
    slug: salon.slug,
    serviceId: service.id,
    variantId: variant.id,
    addOnId: addOn.id,
    staffIds: staffIds as [string, string],
  };
}

/** Salon-local (UTC+7) instant as ISO, e.g. at("2026-12-01", "10:00"). */
export const vnAt = (date: string, hhmm: string): string =>
  new Date(`${date}T${hhmm}:00+07:00`).toISOString();
