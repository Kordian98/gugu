import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_SALON_TIMEZONE } from "@gugu/localization";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { dayTimeline, isActive, serviceLabel, useBookings } from "./bookings";
import { useOnboarding, useTeam } from "./catalog";
import { salonDate } from "./dates";
import { demoWorkspace } from "./demo";
import { useOptionalSalon } from "./SalonContext";
import type { ActivityItem, UpcomingItem, Workspace } from "./types";
import { useDemoMode } from "./useDemoMode";

/**
 * Workspace read model for the shell and Today: identity, setup progress and today's bookings from
 * the booking engine (timeline, appointments, estimated revenue, queue, activity). New customers
 * and occupancy stay empty states until Customers (M7.7) and Insights (M7.8). `?demo=1` (dev only)
 * replaces everything with the labelled demo seed.
 */
export function useWorkspace(): Workspace {
  const demo = useDemoMode();
  const { user } = useAuth();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const salon = useOptionalSalon();
  const onboarding = useOnboarding();
  const tz = salon?.summary?.timezone ?? DEFAULT_SALON_TIMEZONE;
  const today = salonDate(new Date(), tz);
  const bookings = useBookings(today);
  const team = useTeam(salon?.can("members.read") ?? false);
  // "Now" for remaining/upcoming, refreshed every minute (pure render, React Compiler).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      clearInterval(id);
    };
  }, []);
  const name = user?.displayName ?? user?.email?.split("@")[0] ?? null;

  const todayData = useMemo((): Workspace["today"] & { raw: Workspace["todayBookings"] } => {
    const raw = bookings.data?.items ?? [];
    const staffList = team.data?.items ?? [];
    const visible = raw.filter((b) => !b.status.startsWith("cancelled"));
    const done = visible.filter((b) => b.status === "completed");
    const upcoming: UpcomingItem[] = visible
      .filter((b) => isActive(b.status) && Date.parse(b.endsAt) > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        start: new Date(b.startsAt),
        customer: b.customer?.name ?? t("booking.walkIn"),
        service: serviceLabel(b, locale),
        staff: staffList.find((s) => s.id === b.staffId)?.displayName ?? "",
        estimatedVnd: b.totalPriceMinor,
        status:
          b.status === "checked_in"
            ? "inProgress"
            : b.status === "pending"
              ? "pending"
              : "confirmed",
      }));
    const activity: ActivityItem[] = [...raw]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        at: new Date(b.updatedAt),
        kind:
          b.status === "completed"
            ? "completed"
            : b.status === "checked_in"
              ? "checkedIn"
              : "created",
        service: serviceLabel(b, locale),
        estimatedVnd: b.totalPriceMinor,
      }));
    const bookable = staffList.filter(
      (s) => s.isBookable || visible.some((b) => b.staffId === s.id),
    );
    return {
      raw,
      revenueEstimated: done.length
        ? {
            amountVnd: done.reduce((sum, b) => sum + b.totalPriceMinor, 0),
            deltaPct: null,
            trend: [],
          }
        : null,
      appointments: visible.length
        ? {
            total: visible.length,
            remaining: visible.filter((b) => isActive(b.status) && Date.parse(b.startsAt) > now)
              .length,
            done: done.length,
            inProgress: visible.filter((b) => b.status === "checked_in").length,
          }
        : null,
      newCustomers: null,
      occupancy: null,
      staff: bookable.map((s) => ({ id: s.id, name: s.displayName })),
      items: dayTimeline(raw, bookable, today, tz, locale, {
        walkIn: t("booking.walkIn"),
        timeOff: t("calendar.timeOff"),
      }),
      upcoming,
      activity,
    };
  }, [bookings.data, team.data, t, locale, today, tz, now]);

  if (demo) return demoWorkspace();
  const { raw, ...todayView } = todayData;
  return {
    demo: false,
    user: name ? { name, firstName: name.split(/\s+/).slice(-1)[0] ?? name } : null,
    salon: salon?.summary ? { name: salon.summary.name } : null,
    role: salon?.summary?.myRole ?? null,
    plan: null,
    today: todayView,
    todayBookings: raw,
    timeZone: tz,
    setupDone: onboarding.data?.done ?? [],
    canGoLive: onboarding.data?.canGoLive ?? false,
    setupLoaded: onboarding.isSuccess,
  };
}
