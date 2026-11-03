import type { SalonBooking, SetupState } from "@gugu/contracts";

/** Read models the workspace renders. Shapes mirror the planned insights/calendar API (07 §4.3, §4.6). */
export type Plan = "basic" | "pro" | "ultra";

/** UI status groups (timeline colours); see bookingStatusUi in data/bookings.ts. */
export type BookingStatus = "confirmed" | "inProgress" | "pending" | "completed" | "noShow";

export type StaffMember = { id: string; name: string };

export type TimelineItem =
  | {
      kind: "booking";
      /** Unique per block; equals the booking id except for later blocks of a chain. */
      id: string;
      /** Booking to open (set for multi-service blocks; defaults to `id`). */
      bookingId?: string;
      staffId: string;
      start: Date;
      end: Date;
      status: BookingStatus;
      service: string;
      customer: string;
      /** Multi-service booking (06 M6.8): this block's position among the staff blocks. */
      chain?: { index: number; count: number };
    }
  | { kind: "break"; id: string; staffId: string; start: Date; end: Date; label?: string };

export type UpcomingItem = {
  id: string;
  start: Date;
  customer: string;
  service: string;
  staff: string;
  /** Booking price snapshot in VND; always shown as RevenueKind "estimated". */
  estimatedVnd: number;
  status: BookingStatus;
};

export type ActivityItem = {
  id: string;
  at: Date;
  kind: "created" | "checkedIn" | "completed";
  service: string;
  estimatedVnd: number;
};

export type SetupStep = "business" | "services" | "hours" | "team" | "live";

export type Workspace = {
  demo: boolean;
  user: { name: string; firstName: string } | null;
  salon: { name: string } | null;
  plan: Plan | null;
  today: {
    /** RevenueKind = estimated_from_bookings (07 §3.10). */
    revenueEstimated: { amountVnd: number; deltaPct: number | null; trend: number[] } | null;
    appointments: { total: number; remaining: number; done: number; inProgress: number } | null;
    newCustomers: { count: number; deltaPct: number; names: string[] } | null;
    occupancy: { rate: number } | null;
    staff: StaffMember[];
    items: TimelineItem[];
    upcoming: UpcomingItem[];
    activity: ActivityItem[];
  };
  /** Raw bookings of today (real data only), for opening the appointment sheet. */
  todayBookings: SalonBooking[];
  timeZone: string;
  setupDone: SetupStep[];
  /** Every step but "live" is done and the salon is still a draft. */
  canGoLive: boolean;
  /** False while the checklist is loading (avoid flashing the setup card). */
  setupLoaded: boolean;
  /** Guided-setup state for salons from the email-only signup; null for older salons and demo. */
  setup: SetupState | null;
  role: "owner" | "manager" | "receptionist" | "staff" | null;
};
