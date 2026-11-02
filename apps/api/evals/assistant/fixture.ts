/**
 * Deterministic eval salon for the assistant (topic 08 A3). Everything personal is a canary: the
 * PII suite fails if any of these strings reaches a model request. Expected facts are computed by
 * `oracle()` straight from this spec (not through the tools), so the tools are checked against an
 * independent calculation.
 */
import type { PrismaService } from "../../src/infrastructure/prisma/prisma.service";

/** Wednesday 4 Nov 2026, 10:00 in Ho Chi Minh City. */
export const EVAL_NOW = Date.parse("2026-11-04T03:00:00Z");
export const TZ = "Asia/Ho_Chi_Minh";

export const CANARIES = {
  salon: "Canary Lotus Spa",
  staffA: "Canaryhoa Nguyễn",
  customer: "Canarybich Trần",
  customer2: "Canaryminh Lê",
  phone: "0912 345 678",
  phoneDigits: "0912345678",
  email: "canary.khach@gmail.com",
  note: "canary-note-di-ung-gel",
} as const;

export const STAFF = {
  A: { name: CANARIES.staffA },
  B: { name: "Mai" },
  C: { name: "Thu" }, // a name that is also a common word ("doanh thu")
} as const;
export type StaffKey = keyof typeof STAFF;

export const SERVICES = {
  gel: { vi: "Sơn gel", en: "Gel polish", price: 150_000, minutes: 45 },
  haircut: { vi: "Cắt tóc", en: "Haircut", price: 120_000, minutes: 30 },
  massage: { vi: "Massage body", en: "Body massage", price: 300_000, minutes: 60 },
} as const;
export type ServiceKey = keyof typeof SERVICES;

type Status = "confirmed" | "completed" | "cancelled_by_customer" | "no_show";
export interface BookingSpec {
  date: string;
  time: string;
  staff: StaffKey;
  service: ServiceKey;
  status: Status;
  offlineVnd?: number;
}

const oct = (
  day: number,
  staff: StaffKey,
  service: ServiceKey,
  time: string,
  offline?: number,
) => ({
  date: `2026-10-${String(day).padStart(2, "0")}`,
  time,
  staff,
  service,
  status: "completed" as const,
  ...(offline ? { offlineVnd: offline } : {}),
});

export const BOOKINGS: BookingSpec[] = [
  // Today, Wed 4 Nov
  { date: "2026-11-04", time: "09:00", staff: "A", service: "gel", status: "confirmed" },
  { date: "2026-11-04", time: "10:00", staff: "A", service: "gel", status: "confirmed" },
  { date: "2026-11-04", time: "14:00", staff: "A", service: "gel", status: "confirmed" },
  { date: "2026-11-04", time: "09:30", staff: "B", service: "haircut", status: "confirmed" },
  {
    date: "2026-11-04",
    time: "11:00",
    staff: "B",
    service: "massage",
    status: "completed",
    offlineVnd: 280_000,
  },
  {
    date: "2026-11-04",
    time: "15:00",
    staff: "C",
    service: "haircut",
    status: "cancelled_by_customer",
  },
  // Tomorrow, Thu 5 Nov
  { date: "2026-11-05", time: "10:00", staff: "A", service: "massage", status: "confirmed" },
  { date: "2026-11-05", time: "09:00", staff: "B", service: "gel", status: "confirmed" },
  { date: "2026-11-05", time: "13:00", staff: "B", service: "haircut", status: "confirmed" },
  // Yesterday, Tue 3 Nov
  {
    date: "2026-11-03",
    time: "09:00",
    staff: "A",
    service: "gel",
    status: "completed",
    offlineVnd: 150_000,
  },
  {
    date: "2026-11-03",
    time: "10:00",
    staff: "A",
    service: "gel",
    status: "completed",
    offlineVnd: 150_000,
  },
  { date: "2026-11-03", time: "16:00", staff: "C", service: "massage", status: "no_show" },
  // Monday 2 Nov
  { date: "2026-11-02", time: "14:00", staff: "B", service: "massage", status: "completed" },
  // October
  ...[6, 13, 20, 27].map((d) => oct(d, "A", "gel", "10:00", 150_000)),
  ...[7, 8, 14, 15, 21, 28].map((d) => oct(d, "B", "massage", "14:00")),
];

const ESTIMATED = new Set<Status>(["confirmed", "completed"]);
const OCCUPYING = new Set<Status>(["confirmed", "completed", "no_show"]);
const inRange = (b: BookingSpec, from: string, to: string) => b.date >= from && b.date <= to;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const PERIODS = {
  today: ["2026-11-04", "2026-11-04"],
  tomorrow: ["2026-11-05", "2026-11-05"],
  yesterday: ["2026-11-03", "2026-11-03"],
  this_week: ["2026-11-02", "2026-11-08"],
  last_month: ["2026-10-01", "2026-10-31"],
} as const;
type Period = keyof typeof PERIODS;

/** Scheduled minutes per staff per day: 09:00–18:00 minus the 12:00–13:00 break. */
export const SCHEDULED_MINUTES_PER_DAY = 480;

/** Independent ground truth: fact key → number (VND, counts, percents with one decimal). */
export function oracle(): Record<string, number> {
  const facts: Record<string, number> = {};
  for (const [p, [from, to]] of Object.entries(PERIODS) as [Period, readonly [string, string]][]) {
    const rows = BOOKINGS.filter((b) => inRange(b, from, to));
    facts[`count_${p}`] = rows.length;
    facts[`count_${p}_completed`] = rows.filter((b) => b.status === "completed").length;
    facts[`count_${p}_cancelled`] = rows.filter((b) => b.status === "cancelled_by_customer").length;
    facts[`count_${p}_no_show`] = rows.filter((b) => b.status === "no_show").length;
    facts[`count_${p}_active`] = rows.filter((b) => b.status !== "cancelled_by_customer").length;
    facts[`revenue_estimated_${p}`] = sum(
      rows.filter((b) => ESTIMATED.has(b.status)).map((b) => SERVICES[b.service].price),
    );
    facts[`revenue_offline_${p}`] = sum(rows.map((b) => b.offlineVnd ?? 0));
    for (const k of Object.keys(STAFF) as StaffKey[]) {
      facts[`count_${p}_staff_${k}`] = rows.filter((b) => b.staff === k).length;
    }
  }
  // Sums across revenue kinds must never be presented (roadmap X5).
  const f = (k: string) => facts[k] ?? 0;
  facts["revenue_sum_today"] = f("revenue_estimated_today") + f("revenue_offline_today");
  facts["revenue_sum_last_month"] =
    f("revenue_estimated_last_month") + f("revenue_offline_last_month");
  // Utilisation today: booked minutes of occupying bookings ÷ scheduled minutes (3 staff).
  const today = BOOKINGS.filter((b) => b.date === "2026-11-04" && OCCUPYING.has(b.status));
  const booked = (k?: StaffKey) =>
    sum(today.filter((b) => !k || b.staff === k).map((b) => SERVICES[b.service].minutes));
  const pct = (n: number, d: number) => Math.round((n / d) * 1000) / 10;
  facts["utilization_today"] = pct(booked(), 3 * SCHEDULED_MINUTES_PER_DAY);
  for (const k of Object.keys(STAFF) as StaffKey[]) {
    facts[`utilization_today_staff_${k}`] = pct(booked(k), SCHEDULED_MINUTES_PER_DAY);
  }
  return facts;
}

/** Name keys the answer may contain after re-hydration (shown to the owner, never sent). */
export const NAMES: Record<string, string> = {
  staff_A: STAFF.A.name,
  staff_B: STAFF.B.name,
  staff_C: STAFF.C.name,
  service_gel_vi: SERVICES.gel.vi,
  service_gel_en: SERVICES.gel.en,
  service_massage_vi: SERVICES.massage.vi,
};

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);

/** Seeds the eval salon into an existing salon (from `createSalonFixture`). */
export async function seedEvalSalon(prisma: PrismaService, salonId: string): Promise<void> {
  await prisma.salon.update({
    where: { id: salonId },
    data: { name: CANARIES.salon, status: "active" },
  });
  const staffIds = {} as Record<StaffKey, string>;
  for (const [i, k] of (Object.keys(STAFF) as StaffKey[]).entries()) {
    const s = await prisma.staffProfile.create({
      data: { salonId, displayName: STAFF[k].name, sortOrder: i },
    });
    staffIds[k] = s.id;
    await prisma.staffSchedule.createMany({
      data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        salonId,
        staffId: s.id,
        weekday,
        startsAt: time("09:00"),
        endsAt: time("18:00"),
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      })),
    });
    await prisma.staffBreak.createMany({
      data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        salonId,
        staffId: s.id,
        weekday,
        startsAt: time("12:00"),
        endsAt: time("13:00"),
      })),
    });
  }
  const serviceIds = {} as Record<ServiceKey, string>;
  for (const k of Object.keys(SERVICES) as ServiceKey[]) {
    const def = SERVICES[k];
    const s = await prisma.service.create({
      data: {
        salonId,
        name: { vi: def.vi, en: def.en },
        priceAmountMinor: BigInt(def.price),
        durationMinutes: def.minutes,
      },
    });
    serviceIds[k] = s.id;
  }
  const owner = await prisma.salonMember.findFirstOrThrow({ where: { salonId, role: "owner" } });
  for (const [i, b] of BOOKINGS.entries()) {
    const def = SERVICES[b.service];
    const startsAt = at(b.date, b.time);
    const endsAt = new Date(startsAt.getTime() + def.minutes * 60_000);
    const booking = await prisma.booking.create({
      data: {
        salonId,
        referenceCode: `EV${String(i).padStart(3, "0")}`,
        status: b.status,
        source: i % 2 ? "phone" : "salon_profile",
        createdByActorType: "salon_member",
        staffId: staffIds[b.staff],
        startsAt,
        endsAt,
        totalPriceMinor: BigInt(def.price),
        customerName: i % 3 === 0 ? CANARIES.customer2 : CANARIES.customer,
        customerNote: `${CANARIES.note} ${CANARIES.phone} ${CANARIES.email}`,
      },
    });
    await prisma.bookingService.create({
      data: {
        salonId,
        bookingId: booking.id,
        serviceId: serviceIds[b.service],
        staffId: staffIds[b.staff],
        startsAt,
        endsAt,
        name: { vi: def.vi, en: def.en },
        durationMinutes: def.minutes,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        priceMinor: BigInt(def.price),
      },
    });
    if (b.offlineVnd) {
      await prisma.offlineSale.create({
        data: {
          salonId,
          bookingId: booking.id,
          amountMinor: BigInt(b.offlineVnd),
          method: "cash",
          note: CANARIES.note,
          recordedByUserId: owner.userId,
        },
      });
    }
  }
}
