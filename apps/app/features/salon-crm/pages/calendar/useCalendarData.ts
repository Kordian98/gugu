import { useMemo } from "react";

import type { SalonBooking, StaffMember } from "@gugu/contracts";
import { DEFAULT_SALON_TIMEZONE } from "@gugu/localization";

import { useAuth } from "@/services/auth/AuthProvider";

import { ownScopeColumns, useBookings } from "../../data/bookings";
import { useServices, useSettings, useTeam } from "../../data/catalog";
import { useSalon } from "../../data/SalonContext";

/**
 * Everything a calendar day needs: bookings for the range, the team (columns, breaks, time off),
 * services (for the new-appointment flow), opening hours and the salon timezone.
 */
export function useCalendarData(from: string, to: string = from) {
  const { can, summary } = useSalon();
  const { user } = useAuth();
  const ownName = user?.displayName ?? user?.email?.split("@")[0] ?? summary?.name ?? "";
  const bookings = useBookings(from, to);
  const team = useTeam(can("members.read"));
  const services = useServices();
  const settings = useSettings();
  const tz = summary?.timezone ?? DEFAULT_SALON_TIMEZONE;
  const items: SalonBooking[] = useMemo(() => bookings.data?.items ?? [], [bookings.data]);
  // Staff without team access (own calendar) still get their own column for their own bookings.
  const canReadTeam = can("members.read");
  const staff: StaffMember[] = useMemo(() => {
    if (!canReadTeam) return ownScopeColumns(items, ownName);
    return (team.data?.items ?? []).filter(
      (s) => s.isBookable || items.some((b) => b.staffId === s.id),
    );
  }, [canReadTeam, team.data, items, ownName]);
  return { bookings, items, team, staff, services, settings, tz };
}
