import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text, useCalm } from "@gugu/design-system";
import type { SalonBooking, StaffMember } from "@gugu/contracts";
import { formatTime } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useAvailability, useReschedule } from "../../data/bookings";
import { addDays, salonDate } from "../../data/dates";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Segmented } from "../../ui/form";

const weekdayShort = (tag: string, d: Date) =>
  new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(d);

/** Next 14 salon-local days as tappable chips (Today first). */
export function DayStrip({
  value,
  onChange,
  tz,
}: {
  value: string;
  onChange: (d: string) => void;
  tz: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const today = salonDate(new Date(), tz);
  const tag = locale === "vi" ? "vi-VN" : "en-US";
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {days.map((d, i) => {
        const on = d === value;
        const date = new Date(`${d}T12:00:00Z`);
        const label = d === today ? t("calendar.today") : weekdayShort(tag, date);
        return (
          <Pressable
            key={d}
            testID={`crm-day-${String(i)}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              onChange(d);
            }}
            style={{
              width: 58,
              paddingVertical: 8,
              borderRadius: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: on ? c.accentBg : c.line,
              backgroundColor: on ? c.accentBg : c.surface,
            }}
          >
            <Text
              size={11}
              color={on ? c.onAccent : c.muted}
              style={{ textTransform: "capitalize" }}
            >
              {label}
            </Text>
            <Text role="uiSemiBold" size={16} color={on ? c.onAccent : c.ink}>
              {String(Number(d.slice(8)))}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Free start times from the booking engine; the server is the source of truth. */
export function SlotGrid({
  slots,
  loading,
  selected,
  onSelect,
  tz,
}: {
  slots: { startsAt: string; staffIds: string[] }[];
  loading: boolean;
  selected: string | null;
  onSelect: (startsAt: string, staffIds: string[]) => void;
  tz: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  if (loading) return <ActivityIndicator color={c.accent} />;
  if (!slots.length) {
    return (
      <Text testID="crm-no-slots" size={13} color={c.muted}>
        {t("calendar.noSlots")}
      </Text>
    );
  }
  return (
    <View testID="crm-slots" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {slots.map((s) => {
        const on = s.startsAt === selected;
        return (
          <Pressable
            key={s.startsAt}
            testID="crm-slot"
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              onSelect(s.startsAt, s.staffIds);
            }}
            style={{
              minWidth: 72,
              height: 38,
              paddingHorizontal: 10,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: on ? c.accentBg : c.line,
              backgroundColor: on ? c.accentBg : c.surface,
            }}
          >
            <Text role={on ? "uiSemiBold" : "ui"} size={14} color={on ? c.onAccent : c.ink}>
              {formatTime(new Date(s.startsAt), locale, tz)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Reschedule picker inside the booking sheet: same services, this staff or anyone, any day. */
export function RescheduleSlots({
  booking,
  tz,
  staff,
  onPicked,
}: {
  booking: SalonBooking;
  tz: string;
  staff: Pick<StaffMember, "id" | "displayName">[];
  onPicked: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [date, setDate] = useState(salonDate(new Date(booking.startsAt), tz));
  const [who, setWho] = useState<"same" | "any">("same");
  const reschedule = useReschedule();
  const availability = useAvailability({
    ...(booking.service.serviceId
      ? { serviceId: booking.service.serviceId }
      : {
          customService: { name: booking.service.name.vi, priceMinor: booking.service.priceMinor },
        }),
    ...(booking.services.length === 1
      ? {
          durationMinutes: Math.round(
            (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60_000,
          ),
        }
      : {}),
    variantId: booking.service.variantId,
    addOnIds: booking.service.addOns.map((a) => a.addOnId),
    staffId: who === "same" ? booking.staffId : null,
    date,
    // The whole chain moves (06 M6.8). "Anyone" frees the lines the first staff member does;
    // lines done by someone else keep their staff, like the API's reschedule.
    nextServices: booking.services.slice(1).flatMap((l) =>
      l.serviceId === null
        ? []
        : [
            {
              serviceId: l.serviceId,
              variantId: l.variantId,
              addOnIds: l.addOns.map((a) => a.addOnId),
              staffId: who === "any" && l.staffId === booking.staffId ? null : l.staffId,
            },
          ],
    ),
  });
  const name = staff.find((s) => s.id === booking.staffId)?.displayName ?? t("booking.sameStaff");
  return (
    <View
      testID="crm-reschedule-panel"
      style={{ gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.surfaceMuted }}
    >
      <Text role="uiSemiBold" size={14} color={c.ink}>
        {t("booking.rescheduleTitle")}
      </Text>
      <ErrorBanner text={errorText(reschedule.error)} />
      <Segmented<"same" | "any">
        value={who}
        onChange={setWho}
        options={[
          { id: "same", label: name },
          { id: "any", label: t("calendar.anyStaff") },
        ]}
      />
      <DayStrip value={date} onChange={setDate} tz={tz} />
      <SlotGrid
        tz={tz}
        loading={availability.isPending}
        selected={null}
        slots={availability.data?.days[0]?.slots ?? []}
        onSelect={(startsAt) => {
          reschedule.mutate(
            { id: booking.id, body: { startsAt, ...(who === "any" ? { staffId: null } : {}) } },
            {
              onSuccess: onPicked,
              onError: () => {
                void availability.refetch();
              },
            },
          );
        }}
      />
    </View>
  );
}
