import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, Pill, Text, useCalm } from "@gugu/design-system";
import type { BookingStatusValue, SalonBooking, StaffMember } from "@gugu/contracts";
import { formatDateLong, formatTime, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { customerLabel, serviceLabel } from "../../data/bookings";
import { salonDate } from "../../data/dates";
import { EmptyState } from "../../ui/EmptyState";

/** Local calendar date → long label (noon UTC keeps the same calendar day everywhere). */
const dayLabel = (ymd: string, locale: "vi" | "en") =>
  formatDateLong(new Date(`${ymd}T12:00:00Z`), locale, "UTC");

const TONE: Record<BookingStatusValue, "accent" | "brand" | "neutral" | "down"> = {
  pending: "brand",
  confirmed: "accent",
  checked_in: "accent",
  completed: "neutral",
  no_show: "down",
  cancelled_by_customer: "neutral",
  cancelled_by_salon: "neutral",
};

/** Appointment list grouped by day (mobile "All", Appointments page). Cancelled rows are muted. */
export function AgendaList({
  bookings,
  staff,
  tz,
  onPress,
  emptyTitle,
}: {
  bookings: SalonBooking[];
  staff: Pick<StaffMember, "id" | "displayName">[];
  tz: string;
  onPress: (b: SalonBooking) => void;
  emptyTitle: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const labels = { walkIn: t("booking.walkIn"), deleted: t("booking.deletedCustomer") };
  const locale = useLocale();
  if (!bookings.length) return <EmptyState compact icon="calendar" title={emptyTitle} />;
  const days = [...new Set(bookings.map((b) => salonDate(new Date(b.startsAt), tz)))].sort();
  return (
    <View testID="crm-agenda" style={{ gap: 14 }}>
      {days.map((d) => (
        <View key={d} style={{ gap: 8 }}>
          <Text role="uiMedium" size={13} color={c.body} style={{ textTransform: "capitalize" }}>
            {dayLabel(d, locale)}
          </Text>
          {bookings
            .filter((b) => salonDate(new Date(b.startsAt), tz) === d)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((b) => {
              const cancelled = b.status.startsWith("cancelled");
              return (
                <Pressable
                  key={b.id}
                  testID={`crm-agenda-${b.id}`}
                  accessibilityRole="button"
                  onPress={() => {
                    onPress(b);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: c.line,
                    backgroundColor: c.surface,
                    opacity: cancelled ? 0.55 : 1,
                  }}
                >
                  <Text role="uiSemiBold" size={14} color={c.ink} style={{ width: 64 }}>
                    {formatTime(new Date(b.startsAt), locale, tz)}
                  </Text>
                  <Avatar name={customerLabel(b, labels)} size={32} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      role="uiSemiBold"
                      size={14}
                      color={c.ink}
                      numberOfLines={1}
                      style={cancelled ? { textDecorationLine: "line-through" } : undefined}
                    >
                      {customerLabel(b, labels)}
                    </Text>
                    <Text size={12} color={c.body} numberOfLines={1}>
                      {`${serviceLabel(b, locale)} · ${staff.find((s) => s.id === b.staffId)?.displayName ?? ""}`}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text role="uiMedium" size={13} color={c.ink}>
                      {formatVND(b.totalPriceMinor, locale)}
                    </Text>
                    <Pill size={11} tone={TONE[b.status]} label={t(`booking.status.${b.status}`)} />
                  </View>
                </Pressable>
              );
            })}
        </View>
      ))}
    </View>
  );
}
