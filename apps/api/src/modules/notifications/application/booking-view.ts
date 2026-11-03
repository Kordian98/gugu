import type { Locale } from "@gugu/contracts";
import { formatDateLong, formatTime, createI18n } from "@gugu/localization";
import type { PrismaService } from "../../../infrastructure/prisma/prisma.service";

/** Everything a team notification about one booking needs, loaded once (tenant-scoped). */
export async function loadBookingView(prisma: PrismaService, salonId: string, bookingId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, salonId },
    select: {
      id: true,
      salonId: true,
      referenceCode: true,
      startsAt: true,
      staffId: true,
      customerName: true,
      customerAnonymisedAt: true,
      staff: { select: { displayName: true } },
      // Every service of the appointment, in order (multi-service bookings, M6.8).
      services: {
        select: {
          name: true,
          variantName: true,
          staffId: true,
          staff: { select: { displayName: true } },
        },
        orderBy: { sequence: "asc" },
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

/** Template variables have length caps (email-templates.ts): long chains end in "…". */
const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** "Sơn gel · Dài" — or every service of a multi-service booking: "Sơn gel · Dài + Pedicure". */
export function serviceName(b: Pick<BookingView, "services">, locale: Locale): string {
  const names = b.services.map((line) => {
    const name = pick(line.name, locale);
    const variant = line.variantName ? pick(line.variantName, locale) : "";
    return variant ? `${name} · ${variant}` : name;
  });
  return cap(names.join(" + "), 300);
}

/** Staff of every service, without repeats ("Linh, Mai"). */
export function staffNames(b: Pick<BookingView, "staff" | "services">): string {
  const names = b.services.map((l) => l.staff.displayName);
  return cap([...new Set(names.length > 0 ? names : [b.staff.displayName])].join(", "), 120);
}

/** Every staff member working on the booking (own-scope access checks). */
export function bookingStaffIds(b: Pick<BookingView, "staffId" | "services">): string[] {
  return [...new Set([b.staffId, ...b.services.map((l) => l.staffId)])];
}

/** "14:30, Thứ Tư, 14 tháng 10, 2026" / "Wednesday, October 14, 2026 at 2:30 PM" (salon tz). */
export function formatWhen(at: Date, locale: Locale, timeZone: string): string {
  const { t } = createI18n(locale);
  return t("notifications:email.when", {
    date: formatDateLong(at, locale, timeZone),
    time: formatTime(at, locale, timeZone),
  });
}
