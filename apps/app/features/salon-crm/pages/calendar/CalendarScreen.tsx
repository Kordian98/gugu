import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Text, useCalm } from "@gugu/design-system";
import type { RuleOverride, SalonBooking } from "@gugu/contracts";
import { DEFAULT_SALON_TIMEZONE, formatDateLong } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { Timeline } from "../../calendar/Timeline";
import { dayTimeline, hourRange, requiredOverrides, useReschedule } from "../../data/bookings";
import { addDays, instantAt, isoWeekday, minutesInZone, salonDate } from "../../data/dates";
import { useSalon } from "../../data/SalonContext";
import { useWorkspace } from "../../data/useWorkspace";
import { PageHeader } from "../../shell/PageHeader";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner } from "../../ui/form";
import { OverridePrompt } from "../../ui/OverridePrompt";
import { AgendaList } from "./AgendaList";
import { BookingSheet } from "./BookingSheet";
import { NewAppointmentSheet, type NewAppointmentPrefill } from "./NewAppointmentSheet";
import { useCalendarData } from "./useCalendarData";

/**
 * Calendar day view (07 §3.3, ref crm-01/02): staff columns with drag-to-reschedule on desktop and
 * tablet; on phones a single-staff day with a staff switcher plus an "All" agenda. Tapping an empty
 * cell starts a booking at that time; tapping a block opens the appointment.
 */
export function CalendarScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const router = useRouter();
  const ws = useWorkspace();
  const params = useLocalSearchParams<{ new?: string; date?: string; booking?: string }>();
  const errorText = useErrorText();
  const mobile = bp === "mobile";
  const { summary, can } = useSalon();
  const tz = summary?.timezone ?? DEFAULT_SALON_TIMEZONE;
  const today = salonDate(new Date(), tz);
  const [date, setDate] = useState(params.date ?? today);
  const day = useCalendarData(date);
  const [open, setOpen] = useState<SalonBooking | null>(null);
  const [creating, setCreating] = useState<NewAppointmentPrefill | null>(null);
  const [focus, setFocus] = useState<string>("all");
  const reschedule = useReschedule();
  // A drop outside the rules (after hours, short notice): ask for a reason, then retry (06, audited).
  const [overridePending, setOverridePending] = useState<{
    id: string;
    body: { startsAt: string; staffId?: string };
    codes: RuleOverride[];
  } | null>(null);
  const moveTo = (id: string, body: { startsAt: string; staffId?: string }) => {
    reschedule.mutate(
      { id, body },
      {
        onError: (e) => {
          const codes = requiredOverrides(e);
          if (codes?.length && can("bookings.override_rules"))
            setOverridePending({ id, body, codes });
        },
      },
    );
  };
  const rescheduleError = requiredOverrides(reschedule.error) ? null : reschedule.error;

  const hasServices = day.services.data?.items.some((s) => s.isActive) ?? false;
  // `?new=1` (header "New appointment"): open the sheet once services are known; without an
  // active service, explain the prerequisites instead.
  const wantsNew = params.new === "1" && !day.services.isPending;
  // Start on the day being viewed (never in the past).
  const sheet =
    creating ?? (wantsNew && hasServices ? { date: date < today ? today : date } : null);
  const closeNew = () => {
    setCreating(null);
    if (params.new) router.setParams({ new: undefined });
  };

  const items = day.items;
  const staff = day.staff;
  const opening =
    day.settings.data?.openingHours.days.find((d) => d.weekday === isoWeekday(date))?.intervals ??
    [];
  const range = hourRange(opening, staff, items, date, tz, (iso) =>
    minutesInZone(new Date(iso), tz),
  );
  const timeline = useMemo(
    () =>
      dayTimeline(items, staff, date, tz, locale, {
        walkIn: t("booking.walkIn"),
        deleted: t("booking.deletedCustomer"),
        timeOff: t("calendar.timeOff"),
      }),
    [items, staff, date, tz, locale, t],
  );
  const columns = mobile && focus !== "all" ? staff.filter((s) => s.id === focus) : staff;
  const nowMinutes = date === today ? minutesInZone(new Date(), tz) : null;
  const canCreate =
    (ws.role ?? "staff") !== "staff" && day.services.data?.items.some((s) => s.isActive);

  const openBooking = (id: string) => {
    setOpen(items.find((b) => b.id === id) ?? null);
  };
  // `?booking=<id>` (e.g. from a payroll commission line): shown once the day has loaded; closing
  // it clears the param.
  const linked = params.booking ? (items.find((x) => x.id === params.booking) ?? null) : null;
  const shown = open ?? linked;

  return (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}>
      <PageHeader title={t("pages.calendar.title")} workspace={ws} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("timeline.prevDay")}
          onPress={() => {
            setDate(addDays(date, -1));
          }}
          style={navBtn(c.line, c.surface)}
        >
          <Icon name="chevronLeft" size={16} color={c.ink} />
        </Pressable>
        <CalmButton
          size="sm"
          variant="secondary"
          label={t("calendar.today")}
          onPress={() => {
            setDate(today);
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("timeline.nextDay")}
          onPress={() => {
            setDate(addDays(date, 1));
          }}
          style={navBtn(c.line, c.surface)}
        >
          <Icon name="chevronRight" size={16} color={c.ink} />
        </Pressable>
        <Text
          testID="crm-calendar-date"
          role="uiSemiBold"
          size={16}
          color={c.ink}
          style={{ marginLeft: 6, textTransform: "capitalize", flexShrink: 1 }}
        >
          {formatDateLong(new Date(instantAt(date, 12 * 60, tz)), locale, tz)}
        </Text>
        <View style={{ flex: 1 }} />
      </View>
      <ErrorBanner
        text={
          rescheduleError
            ? `${errorText(rescheduleError) ?? ""} ${t("calendar.dragRevertHint")}`
            : null
        }
      />

      {mobile && staff.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {[
            { id: ALL, name: t("calendar.all") },
            ...staff.map((s) => ({ id: s.id, name: s.displayName })),
          ].map((s) => {
            const on = focus === s.id;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setFocus(s.id);
                }}
                style={{
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: 18,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: on ? c.accentBg : c.line,
                  backgroundColor: on ? c.accentBg : c.surface,
                }}
              >
                <Text role={on ? "uiSemiBold" : "ui"} size={13} color={on ? c.onAccent : c.ink}>
                  {s.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <CalmCard style={{ gap: 12 }}>
        {day.bookings.isPending && day.team.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : staff.length === 0 ? (
          <EmptyState
            testID="crm-calendar-no-staff"
            icon="calendar"
            title={t("pages.calendar.emptyTitle")}
            body={t("pages.calendar.emptyBody")}
            action={
              <CalmButton
                label={t("pages.setupCta")}
                icon="sparkles"
                onPress={() => {
                  router.push(`/${locale}/business/team` as never);
                }}
              />
            }
          />
        ) : mobile && focus === "all" ? (
          <AgendaList
            bookings={items}
            staff={staff}
            tz={tz}
            onPress={setOpen}
            emptyTitle={t("timeline.emptyTitle")}
          />
        ) : (
          <Timeline
            staff={columns.map((s) => ({ id: s.id, name: s.displayName }))}
            items={timeline}
            startHour={range.startHour}
            endHour={range.endHour}
            hourHeight={mobile ? 64 : 56}
            timeZone={tz}
            nowMinutes={nowMinutes}
            onPressItem={openBooking}
            granularity={day.settings.data?.booking.slotGranularityMinutes ?? 15}
            pointer={bp === "desktop" || bp === "wide" ? "mouse" : "touch"}
            onCreateRange={
              canCreate
                ? (staffId, start, end) => {
                    setCreating({ date, staffId, minutes: start, durationMinutes: end - start });
                  }
                : undefined
            }
            onPressSlot={
              canCreate
                ? (staffId, minutes) => {
                    setCreating({ date, staffId, minutes });
                  }
                : undefined
            }
            onMoveItem={
              !mobile && (ws.role ?? "staff") !== "staff"
                ? (id, staffId, minutes) => {
                    const b = items.find((x) => x.id === id);
                    moveTo(id, {
                      startsAt: instantAt(date, minutes, tz),
                      ...(b && b.staffId !== staffId ? { staffId } : {}),
                    });
                  }
                : undefined
            }
          />
        )}
      </CalmCard>

      {overridePending ? (
        <OverridePrompt
          codes={overridePending.codes}
          busy={reschedule.isPending}
          onCancel={() => {
            setOverridePending(null);
            reschedule.reset();
          }}
          onConfirm={(reason) => {
            const p = overridePending;
            reschedule.mutate(
              { id: p.id, body: { ...p.body, overrides: p.codes, overrideReason: reason } },
              {
                onSettled: () => {
                  setOverridePending(null);
                },
              },
            );
          }}
        />
      ) : null}
      {shown ? (
        <BookingSheet
          key={shown.id}
          booking={shown}
          staff={staff}
          tz={tz}
          onClose={() => {
            setOpen(null);
            if (params.booking) router.setParams({ booking: undefined });
          }}
        />
      ) : null}
      {wantsNew && !hasServices ? (
        <Redirect href={`/${locale}/business/appointments?new=1` as never} />
      ) : null}
      {sheet ? (
        <NewAppointmentSheet
          services={day.services.data?.items ?? []}
          staff={staff}
          tz={tz}
          prefill={sheet}
          onClose={closeNew}
        />
      ) : null}
    </ScrollView>
  );
}

const ALL = "all";

const navBtn = (border: string, bg: string) =>
  ({
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: bg,
    alignItems: "center",
    justifyContent: "center",
  }) as const;
