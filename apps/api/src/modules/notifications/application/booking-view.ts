import type { Locale } from "@gugu/contracts";
import { formatDateLong, formatTime, formatVND, createI18n } from "@gugu/localization";
import type { PrismaService } from "../../../infrastructure/prisma/prisma.service";

/** Everything a notification about one booking needs, loaded once (tenant-scoped). */
export async function loadBookingView(prisma: PrismaService, salonId: string, bookingId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, salonId },
    select: {
      id: true,
      salonId: true,
      referenceCode: true,
      status: true,
      startsAt: true,
      endsAt: true,
      version: true,
      createdAt: true,
      staffId: true,
      customerName: true,
      customerEmail: true,
      customerAnonymisedAt: true,
      totalPriceMinor: true,
      totalPriceMaxMinor: true,
      staff: { select: { displayName: true } },
      services: {
        select: { name: true, variantName: true },
        orderBy: { sequence: "asc" },
        take: 1,
      },
      salon: {
        select: {
          name: true,
          timezone: true,
          defaultLocale: true,
          phoneE164: true,
          location: {
            select: {
              addressLine: true,
              ward: { select: { nameVi: true, nameEn: true } },
              province: { select: { nameVi: true, nameEn: true } },
            },
          },
        },
      },
    },
  });
}

export type BookingView = NonNullable<Awaited<ReturnType<typeof loadBookingView>>>;

type Localized = { vi?: string; en?: string } | null;

const pick = (v: unknown, locale: Locale): string => {
  const o = (v ?? {}) as Localized;
  return (locale === "en" && o?.en) || o?.vi || o?.en || "";
};

export function serviceName(b: BookingView, locale: Locale): string {
  const line = b.services[0];
  if (!line) return "";
  const name = pick(line.name, locale);
  const variant = line.variantName ? pick(line.variantName, locale) : "";
  return variant ? `${name} · ${variant}` : name;
}

/** "14:30, Thứ Tư, 14 tháng 10, 2026" / "Wednesday, October 14, 2026 at 2:30 PM" (salon tz). */
export function formatWhen(at: Date, locale: Locale, timeZone: string): string {
  const { t } = createI18n(locale);
  return t("notifications:email.when", {
    date: formatDateLong(at, locale, timeZone),
    time: formatTime(at, locale, timeZone),
  });
}

export function formatPrice(b: BookingView, locale: Locale): string {
  const min = Number(b.totalPriceMinor);
  const max = b.totalPriceMaxMinor === null ? null : Number(b.totalPriceMaxMinor);
  return max !== null && max > min
    ? `${formatVND(min, locale)} – ${formatVND(max, locale)}`
    : formatVND(min, locale);
}

export function formatAddress(b: BookingView, locale: Locale): string | null {
  const l = b.salon.location;
  if (!l) return null;
  const name = (x: { nameVi: string; nameEn: string }) => (locale === "en" ? x.nameEn : x.nameVi);
  return [l.addressLine, name(l.ward), name(l.province)].filter(Boolean).join(", ");
}
