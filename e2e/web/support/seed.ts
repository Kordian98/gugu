// Deterministic seed for the E2E suite, created through the public API (no DB writes) by
// global-setup. One salon per (Playwright project × spec area), so files running in parallel never
// share an account (two parallel magic-link sign-ins for one email would race) or a salon.
// Every name, email, phone and wall-clock time below is fixed; only the calendar date is "today in
// Asia/Ho_Chi_Minh" because the booking engine refuses past times and has no injectable clock over
// HTTP. Tests look entities up by these fixed values and by the IDs in the manifest.
import { ApiClient } from "./api";
import { MAIL_DOMAIN } from "./env";
import { addDays, vnDate, vnInstant, vnNow } from "./time";

export const PROJECTS = ["chromium", "webkit"] as const;
export const AREAS = ["roles", "zalo", "admin", "assistant", "mobile", "en"] as const;
export type Area = (typeof AREAS)[number];

export const mail = (local: string, project: string): string =>
  `${local}.${project}@${MAIL_DOMAIN}`;

/** Fixed seed values (per salon only the emails and the salon name differ). */
export const SEED = {
  salonName: (area: string, project: string) => `Lotus E2E ${area} ${project}`,
  ownerPhone: "0912 345 678",
  street: "12 Lê Lợi",
  staff: {
    lan: { name: "Nguyễn Lan", color: "lilac" },
    mai: { name: "Trần Mai", color: "pink" },
  },
  services: {
    gel: { vi: "Sơn gel", en: "Gel polish", price: 150_000, minutes: 60 },
    cut: { vi: "Cắt tóc nữ", en: "Women's haircut", price: 200_000, minutes: 45 },
  },
  /** Today's bookings: Lan's own client and Mai's client (staff own-scope checks). */
  bookings: {
    lanToday: {
      staff: "lan",
      service: "gel",
      time: "10:00",
      name: "Võ Thị Hồng",
      phone: "0977 123 456",
    },
    maiToday: {
      staff: "mai",
      service: "cut",
      time: "11:00",
      name: "Trần Bảo Vy",
      phone: "0987 000 222",
    },
  },
} as const;

/** What each area needs on top of the base salon (owner, hours, Lan + Mai, two services, live). */
const AREA_SPEC: Record<
  Area,
  { bookings: boolean; staffAccount: boolean; receptionist: boolean; locale: "vi" | "en" }
> = {
  roles: { bookings: true, staffAccount: true, receptionist: true, locale: "vi" },
  zalo: { bookings: false, staffAccount: false, receptionist: true, locale: "vi" },
  admin: { bookings: false, staffAccount: false, receptionist: false, locale: "vi" },
  assistant: { bookings: false, staffAccount: false, receptionist: false, locale: "vi" },
  mobile: { bookings: true, staffAccount: false, receptionist: false, locale: "vi" },
  en: { bookings: true, staffAccount: false, receptionist: false, locale: "en" },
};

export interface SeededSalon {
  project: string;
  area: Area;
  salonId: string;
  salonName: string;
  ownerEmail: string;
  staffEmail: string | null;
  receptionistEmail: string | null;
  staffIds: { lan: string; mai: string };
  serviceIds: { gel: string; cut: string };
  bookingIds: { lanToday: string; maiToday: string } | null;
  today: string;
}

export type SeedManifest = Record<string, Record<Area, SeededSalon> & { adminEmail: string }>;

interface Item {
  id: string;
}

// One X-Forwarded-For per seeded account, each in its own /24 (rate limits key on the IP prefix).
let ipCounter = 0;
const nextIp = () => `10.77.${String(++ipCounter)}.1`;

export async function seedSalon(project: string, area: Area): Promise<SeededSalon> {
  const spec = AREA_SPEC[area];
  const ownerEmail = mail(`owner-${area}`, project);
  const owner = await ApiClient.signIn(ownerEmail, nextIp());
  const cats = (await owner.call<{ items: (Item & { slug: string })[] }>("/public/categories"))
    .items;
  const prov = (await owner.call<{ items: Item[] }>("/public/locations?level=province")).items[0];
  if (!prov) throw new Error("seed: no provinces in /public/locations");
  const ward = (
    await owner.call<{ items: Item[] }>(`/public/locations?level=ward&parentId=${prov.id}`)
  ).items[0];
  const nails = cats.find((c) => c.slug === "nails") ?? cats[0];
  if (!ward || !nails) throw new Error("seed: missing ward/category reference data");

  const salonName = SEED.salonName(area, project);
  const { salonId: S } = await owner.call<{ salonId: string }>("/salons/registrations", "POST", {
    businessName: salonName,
    categoryId: nails.id,
    phone: SEED.ownerPhone,
    provinceId: prov.id,
    wardId: ward.id,
    streetAddress: SEED.street,
    locationsHint: "1",
    locale: spec.locale,
  });
  // Open every day 08:00–22:00 so "today" always has room for the fixed booking times.
  const week = [1, 2, 3, 4, 5, 6, 7];
  await owner.call(`/salons/${S}/settings/opening-hours`, "PATCH", {
    days: week.map((weekday) => ({ weekday, intervals: [{ start: "08:00", end: "22:00" }] })),
  });

  const staffIds = { lan: "", mai: "" };
  for (const key of ["lan", "mai"] as const) {
    const s = SEED.staff[key];
    staffIds[key] = (
      await owner.call<Item>(`/salons/${S}/team`, "POST", { displayName: s.name, color: s.color })
    ).id;
    await owner.call(`/salons/${S}/team/${staffIds[key]}/schedule`, "PATCH", {
      days: week.map((weekday) => ({
        weekday,
        intervals: [{ start: "08:00", end: "22:00" }],
        breaks: [],
      })),
    });
  }
  const gel = await owner.call<Item>(`/salons/${S}/services`, "POST", {
    name: { vi: SEED.services.gel.vi, en: SEED.services.gel.en },
    price: SEED.services.gel.price,
    durationMinutes: SEED.services.gel.minutes,
    staffIds: [staffIds.lan, staffIds.mai],
  });
  const cut = await owner.call<Item>(`/salons/${S}/services`, "POST", {
    name: { vi: SEED.services.cut.vi, en: SEED.services.cut.en },
    price: SEED.services.cut.price,
    durationMinutes: SEED.services.cut.minutes,
    staffIds: [staffIds.mai],
  });
  await owner.call(`/salons/${S}/go-live`, "POST", {});

  const today = vnDate();
  const serviceIds = { gel: gel.id, cut: cut.id };
  let bookingIds: SeededSalon["bookingIds"] = null;
  if (spec.bookings) {
    const ids = { lanToday: "", maiToday: "" };
    for (const key of ["lanToday", "maiToday"] as const) {
      const b = SEED.bookings[key];
      // Past wall-clock times today need the documented lead-time override (as the demo seed does).
      const past = b.time <= vnNow();
      ids[key] = (
        await owner.call<Item>(`/salons/${S}/bookings`, "POST", {
          serviceId: serviceIds[b.service],
          staffId: staffIds[b.staff],
          startsAt: vnInstant(today, b.time),
          source: "phone",
          customer: { name: b.name, phone: b.phone },
          ...(past
            ? { overrides: ["lead_time"], overrideReason: "E2E seed: fixed time earlier today" }
            : {}),
        })
      ).id;
    }
    bookingIds = ids;
  }

  // Member accounts join through the real invitation API (the invite UI is covered in roles.spec).
  const join = async (email: string, role: "staff" | "receptionist", staffProfileId?: string) => {
    const inv = await owner.call<{ acceptUrl: string }>(`/salons/${S}/invitations`, "POST", {
      role,
      ...(staffProfileId ? { staffProfileId } : {}),
      locale: "vi",
    });
    const token = new URL(inv.acceptUrl).searchParams.get("token") ?? "";
    const member = await ApiClient.signIn(email, nextIp());
    await member.call("/invitations/accept", "POST", { token });
    return email;
  };
  const staffEmail = spec.staffAccount
    ? await join(mail(`staff-${area}`, project), "staff", staffIds.lan)
    : null;
  const receptionistEmail = spec.receptionist
    ? await join(mail(`recep-${area}`, project), "receptionist")
    : null;

  return {
    project,
    area,
    salonId: S,
    salonName,
    ownerEmail,
    staffEmail,
    receptionistEmail,
    staffIds,
    serviceIds,
    bookingIds,
    today,
  };
}

export { addDays };
