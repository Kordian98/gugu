import { useMemo } from "react";

import type { SalonBooking, StaffMember } from "@gugu/contracts";
import { DEFAULT_SALON_TIMEZONE } from "@gugu/localization";

import { useBookings } from "../../data/bookings";
import { useServices, useSettings, useTeam } from "../../data/catalog";
import { useSalon } from "../../data/SalonContext";

/**
 * Everything a calendar day needs: bookings for the range, the team (columns, breaks, time off),
 * services (for the new-appointment flow), opening hours and the salon timezone.
 */
export function useCalendarData(from: string, to: string = from) {
  const { can, summary } = useSalon();
  const bookings = useBookings(from, to);
  const team = useTeam(can("members.read"));
  const services = useServices();
  const settings = useSettings();
  const tz = summary?.timezone ?? DEFAULT_SALON_TIMEZONE;
  const items: SalonBooking[] = useMemo(() => bookings.data?.items ?? [], [bookings.data]);
  // Staff without team access (own calendar) still get a column for their own bookings.
  const staff: StaffMember[] = useMemo(() => {
    const list = (team.data?.items ?? []).filter(
      (s) => s.isBookable || items.some((b) => b.staffId === s.id),
    );
    if (list.length || !items.length) return list;
    const ids = [...new Set(items.map((b) => b.staffId))];
    return ids.map((id, i) => ({
      id,
      displayName: summary?.name ?? String(i + 1),
      color: "lilac",
      isBookable: true,
      sortOrder: i,
      serviceIds: [],
      member: null,
      pendingInvitation: null,
      schedule: { days: [] },
      timeOff: [],
    }));
  }, [team.data, items, summary?.name]);
  return { bookings, items, team, staff, services, settings, tz };
}
