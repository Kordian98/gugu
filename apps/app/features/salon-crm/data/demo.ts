import { DEFAULT_SALON_TIMEZONE } from "@gugu/localization";

import type { Workspace } from "./types";

/** Today's date (YYYY-MM-DD) in the salon timezone. */
function salonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_SALON_TIMEZONE }).format(new Date());
}

/** "10:30" today in Ho Chi Minh City → Date (UTC instant). */
function at(hhmm: string): Date {
  return new Date(`${salonToday()}T${hhmm}:00+07:00`);
}

/**
 * Clearly labelled demo seed (dev only, ?demo=1). Vietnamese salon content, VND prices; it exists to
 * compare the layout with the owner's reference until the booking engine (06) serves real data.
 */
export function demoWorkspace(): Workspace {
  return {
    demo: true,
    user: { name: "Nguyễn Linh", firstName: "Linh" },
    salon: { name: "GuGu Demo Salon" },
    plan: "ultra",
    today: {
      revenueEstimated: {
        amountVnd: 3450000,
        deltaPct: 12.8,
        trend: [8, 9, 7, 10, 9, 12, 11, 14, 13, 16],
      },
      appointments: { total: 24, remaining: 8, done: 14, inProgress: 2 },
      newCustomers: { count: 12, deltaPct: 18, names: ["Ngọc Anh", "Thu Trang", "Bảo Vy"] },
      occupancy: { rate: 0.86 },
      staff: [
        { id: "s1", name: "Mai" },
        { id: "s2", name: "Hà" },
        { id: "s3", name: "Tuấn" },
        { id: "s4", name: "Linh" },
      ],
      items: [
        {
          kind: "booking",
          id: "b1",
          staffId: "s1",
          start: at("10:00"),
          end: at("11:30"),
          status: "confirmed",
          service: "Gel + vẽ móng",
          customer: "Ngọc Anh",
        },
        { kind: "break", id: "k1", staffId: "s1", start: at("12:00"), end: at("13:00") },
        {
          kind: "booking",
          id: "b2",
          staffId: "s1",
          start: at("15:00"),
          end: at("16:30"),
          status: "confirmed",
          service: "Gel + vẽ móng",
          customer: "Thu Trang",
        },
        {
          kind: "booking",
          id: "b3",
          staffId: "s2",
          start: at("11:00"),
          end: at("12:30"),
          status: "inProgress",
          service: "Uốn mi + nhuộm mi",
          customer: "Bảo Vy",
        },
        {
          kind: "booking",
          id: "b4",
          staffId: "s2",
          start: at("15:00"),
          end: at("16:00"),
          status: "inProgress",
          service: "Chăm sóc da mặt",
          customer: "Minh Châu",
        },
        {
          kind: "booking",
          id: "b5",
          staffId: "s3",
          start: at("10:00"),
          end: at("11:00"),
          status: "inProgress",
          service: "Cắt tóc nam",
          customer: "Quốc Huy",
        },
        { kind: "break", id: "k2", staffId: "s3", start: at("12:00"), end: at("13:00") },
        {
          kind: "booking",
          id: "b6",
          staffId: "s3",
          start: at("14:00"),
          end: at("15:30"),
          status: "pending",
          service: "Đắp bột",
          customer: "Hải Yến",
        },
        {
          kind: "booking",
          id: "b7",
          staffId: "s4",
          start: at("10:00"),
          end: at("11:30"),
          status: "confirmed",
          service: "Gel + vẽ móng",
          customer: "Lan Phương",
        },
        { kind: "break", id: "k3", staffId: "s4", start: at("12:00"), end: at("13:00") },
        {
          kind: "booking",
          id: "b8",
          staffId: "s4",
          start: at("14:00"),
          end: at("14:45"),
          status: "pending",
          service: "Sơn gel",
          customer: "Kim Ngân",
        },
        {
          kind: "booking",
          id: "b9",
          staffId: "s4",
          start: at("16:00"),
          end: at("17:00"),
          status: "pending",
          service: "Sơn gel",
          customer: "Kim Ngân",
        },
      ],
      upcoming: [
        {
          id: "u1",
          start: at("12:45"),
          customer: "Thảo Vy",
          service: "Nhuộm + cắt",
          staff: "Tuấn",
          estimatedVnd: 650000,
          status: "confirmed",
        },
        {
          id: "u2",
          start: at("13:15"),
          customer: "Minh Thư",
          service: "Chăm sóc da mặt",
          staff: "Hà",
          estimatedVnd: 450000,
          status: "completed",
        },
        {
          id: "u3",
          start: at("14:00"),
          customer: "Hải Yến",
          service: "Đắp bột",
          staff: "Tuấn",
          estimatedVnd: 350000,
          status: "pending",
        },
      ],
      activity: [
        {
          id: "a1",
          at: at("11:02"),
          kind: "checkedIn",
          service: "Uốn mi + nhuộm mi",
          estimatedVnd: 400000,
        },
        {
          id: "a2",
          at: at("10:41"),
          kind: "created",
          service: "Nhuộm + cắt",
          estimatedVnd: 650000,
        },
        {
          id: "a3",
          at: at("10:15"),
          kind: "completed",
          service: "Cắt tóc nam",
          estimatedVnd: 150000,
        },
      ],
    },
    setupDone: ["business", "services", "hours", "team", "live"],
    canGoLive: false,
    todayBookings: [],
    timeZone: DEFAULT_SALON_TIMEZONE,
    setupLoaded: true,
    role: "owner",
  };
}
