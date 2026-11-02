import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmCard, useCalm } from "@gugu/design-system";
import type { SalonBooking } from "@gugu/contracts";

import { addDays, salonDate } from "../../data/dates";
import { SectionScreen } from "../SectionScreen";
import { AgendaList } from "./AgendaList";
import { BookingSheet } from "./BookingSheet";
import { useCalendarData } from "./useCalendarData";

/** Appointments page (07 §3.1): the next 7 days as an agenda, from the booking engine. */
export function UpcomingAppointments() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const [open, setOpen] = useState<SalonBooking | null>(null);
  const today = salonDate(new Date());
  const data = useCalendarData(today, addDays(today, 6));
  return (
    <SectionScreen id="appointments">
      <CalmCard>
        {data.bookings.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <AgendaList
            bookings={data.items}
            staff={data.staff}
            tz={data.tz}
            onPress={setOpen}
            emptyTitle={t("pages.appointments.emptyTitle")}
          />
        )}
      </CalmCard>
      {open ? (
        <BookingSheet
          key={open.id}
          booking={open}
          staff={data.staff}
          tz={data.tz}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </SectionScreen>
  );
}
