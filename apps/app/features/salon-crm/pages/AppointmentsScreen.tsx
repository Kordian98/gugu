import { Redirect, useLocalSearchParams } from "expo-router";

import { useLocale } from "@/services/i18n/useLocale";
import { UpcomingAppointments } from "./calendar/UpcomingAppointments";

/** New appointments can use either a catalog service or a one-off service. */
export function AppointmentsScreen() {
  const locale = useLocale();
  const { new: isNew } = useLocalSearchParams<{ new?: string | undefined }>();
  if (isNew === "1") return <Redirect href={`/${locale}/business/calendar?new=1`} />;
  return <UpcomingAppointments />;
}
