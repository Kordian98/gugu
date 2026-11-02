/** Read models the workspace renders. Shapes mirror the planned insights/calendar API (07 §4.3, §4.6). */
export type Plan = "basic" | "pro" | "ultra";

export type BookingStatus = "confirmed" | "inProgress" | "pending" | "completed";

export type StaffMember = { id: string; name: string };

export type TimelineItem =
  | {
      kind: "booking";
      id: string;
      staffId: string;
      start: Date;
      end: Date;
      status: BookingStatus;
      service: string;
      customer: string;
    }
  | { kind: "break"; id: string; staffId: string; start: Date; end: Date };

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
    revenueEstimated: { amountVnd: number; deltaPct: number; trend: number[] } | null;
    appointments: { total: number; remaining: number; done: number; inProgress: number } | null;
    newCustomers: { count: number; deltaPct: number; names: string[] } | null;
    occupancy: { rate: number } | null;
    staff: StaffMember[];
    items: TimelineItem[];
    upcoming: UpcomingItem[];
    activity: ActivityItem[];
  };
  setupDone: SetupStep[];
  /** Every step but "live" is done and the salon is still a draft. */
  canGoLive: boolean;
  /** False while the checklist is loading (avoid flashing the setup card). */
  setupLoaded: boolean;
  role: "owner" | "manager" | "receptionist" | "staff" | null;
};
