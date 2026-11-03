// Deterministic seed for the E2E suite, created through the public API (no DB writes) by
// global-setup. One salon per Playwright project so chromium and webkit never share state.
// Every name, email, phone and wall-clock time below is fixed; only the calendar date is "today in
// Asia/Ho_Chi_Minh" because the booking engine refuses past times (it has no injectable clock over
// HTTP). Entities are looked up by these fixed values in the tests.
import { ApiClient } from "./api";
import { MAIL_DOMAIN } from "./env";
import { addDays, vnDate, vnInstant, vnNow } from "./time";

export const PROJECTS = ["chromium", "webkit"] as const;
export type ProjectName = (typeof PROJECTS)[number];

export const mail = (local: string, project: string): string =>
  `${local}.${project}@${MAIL_DOMAIN}`;

/** Fixed seed values (per project only the emails and salon name differ). */
export const SEED = {
  salonName: (p: string) => `Lotus E2E Spa ${p}`,
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

export interface SeededSalon {
  project: string;
  salonId: string;
  salonName: string;
  ownerEmail: string;
  staffEmail: string;
  receptionistEmail: string;
  adminEmail: string;
  staffIds: { lan: string; mai: string };
  serviceIds: { gel: string; cut: string };
  bookingIds: { lanToday: string; maiToday: string };
  today: string;
}

interface Item {
  id: string;
}

export async function seedSalon(project: string): Promise<SeededSalon> {
  const ownerEmail = mail("owner", project);
  const owner = await ApiClient.signIn(ownerEmail);
  const cats = (await owner.call<{ items: (Item & { slug: string })[] }>("/public/categories"))
    .items;
  const prov = (await owner.call<{ items: Item[] }>("/public/locations?level=province")).items[0];
  if (!prov) throw new Error("seed: no provinces in /public/locations");
  const ward = (
    await owner.call<{ items: Item[] }>(`/public/locations?level=ward&parentId=${prov.id}`)
  ).items[0];
  const nails = cats.find((c) => c.slug === "nails") ?? cats[0];
  if (!ward || !nails) throw new Error("seed: missing ward/category reference data");

  const salonName = SEED.salonName(project);
  const { salonId: S } = await owner.call<{ salonId: string }>("/salons/registrations", "POST", {
    businessName: salonName,
    categoryId: nails.id,
    phone: SEED.ownerPhone,
    provinceId: prov.id,
    wardId: ward.id,
    streetAddress: SEED.street,
    locationsHint: "1",
    locale: "vi",
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
  const bookingIds = { lanToday: "", maiToday: "" };
  for (const key of ["lanToday", "maiToday"] as const) {
    const b = SEED.bookings[key];
    // Past wall-clock times today need the documented lead-time override (same as the demo seed).
    const past = b.time <= vnNow();
    bookingIds[key] = (
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

  // Staff account linked to Lan's profile, receptionist account (accepted via API here; the
  // invitation UI is covered in roles.spec.ts with its own invite).
  const staffEmail = mail("staff", project);
  const receptionistEmail = mail("recep", project);
  for (const [email, role, staffProfileId] of [
    [staffEmail, "staff", staffIds.lan],
    [receptionistEmail, "receptionist", undefined],
  ] as const) {
    const inv = await owner.call<{ acceptUrl: string }>(`/salons/${S}/invitations`, "POST", {
      role,
      ...(staffProfileId ? { staffProfileId } : {}),
      locale: "vi",
    });
    const token =
      /[?&]token=([\w-]+)/.exec(inv.acceptUrl)?.[1] ?? inv.acceptUrl.split("/").pop() ?? "";
    const member = await ApiClient.signIn(email);
    await member.call("/invitations/accept", "POST", { token });
  }

  return {
    project,
    salonId: S,
    salonName,
    ownerEmail,
    staffEmail,
    receptionistEmail,
    adminEmail: mail("admin", project),
    staffIds,
    serviceIds,
    bookingIds,
    today,
  };
}

export { addDays };
