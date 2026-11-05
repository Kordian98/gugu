import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, MIN_TOUCH, Text, useCalm } from "@gugu/design-system";
import type { RuleOverride, SalonBooking } from "@gugu/contracts";
import { DEFAULT_SALON_TIMEZONE, formatDateLong } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { Timeline } from "../../calendar/Timeline";
import type { AppointmentDraft } from "../../calendar/AppointmentDraft";
import { dayTimeline, hourRange, requiredOverrides, useReschedule } from "../../data/bookings";
import { addDays, instantAt, isoWeekday, minutesInZone, salonDate } from "../../data/dates";
import { useSalon } from "../../data/SalonContext";
import { useWorkspace } from "../../data/useWorkspace";
import { PageHeader } from "../../shell/PageHeader";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { QueryError } from "../../ui/QueryError";
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
  const reduceMotion = useReducedMotion();
  const { summary, can } = useSalon();
  const tz = summary?.timezone ?? DEFAULT_SALON_TIMEZONE;
  const today = salonDate(new Date(), tz);
  const [viewDate, setDate] = useState(params.date ?? today);
  const [creating, setCreating] = useState<NewAppointmentPrefill | null>(null);
  const [previewState, setPreview] = useState<AppointmentDraft | null>(null);
  // Ignore a final mutation notification from the closing form: it cannot resurrect a draft.
  const preview = creating !== null || params.new === "1" ? previewState : null;
  const date = preview?.date ?? viewDate;
  const day = useCalendarData(date);
  const loadFailed = day.bookings.isError || day.team.isError || day.settings.isError;
  const noCalendarData =
    !day.bookings.data || (can("members.read") && !day.team.data) || !day.settings.data;
  const retryCalendar = () => {
    void day.bookings.refetch();
    if (can("members.read")) void day.team.refetch();
    void day.settings.refetch();
  };
  const [open, setOpen] = useState<SalonBooking | null>(null);
  const [focus, setFocus] = useState<string>("all");
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [gridY, setGridY] = useState(0);
  const [savedBooking, setSavedBooking] = useState<SalonBooking | null>(null);
  const scrolledBooking = useRef<string | null>(null);
  const scrolledPreview = useRef<string | null>(null);
  const updatePreview = useCallback((draft: AppointmentDraft | null) => {
    setPreview(draft);
  }, []);
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

  const wantsNew = params.new === "1" && !day.services.isPending;
  const sheet = creating ?? (wantsNew ? { date: date < today ? today : date } : null);
  const closeNew = () => {
    setCreating(null);
    setPreview(null);
    if (params.new) router.setParams({ new: undefined });
  };

  const items = useMemo(
    () => day.items.filter((b) => salonDate(new Date(b.startsAt), tz) === date),
    [day.items, date, tz],
  );
  const staff = day.staff;
  const opening =
    day.settings.data?.openingHours.days.find((d) => d.weekday === isoWeekday(date))?.intervals ??
    [];
  const baseRange = hourRange(opening, staff, items, date, tz, (iso) =>
    minutesInZone(new Date(iso), tz),
  );
  const draftMinutes = (preview?.blocks ?? []).flatMap((block) =>
    [block.startsAt, block.endsAt].map((iso) => {
      const day = salonDate(new Date(iso), tz);
      return day < date ? 0 : day > date ? 1440 : minutesInZone(new Date(iso), tz);
    }),
  );
  const range = {
    startHour: Math.min(baseRange.startHour, ...draftMinutes.map((m) => Math.floor(m / 60))),
    endHour: Math.max(baseRange.endHour, ...draftMinutes.map((m) => Math.ceil(m / 60))),
  };
  const timeline = useMemo(
    () =>
      dayTimeline(items, staff, date, tz, locale, {
        walkIn: t("booking.walkIn"),
        deleted: t("booking.deletedCustomer"),
        timeOff: t("calendar.timeOff"),
      }),
    [items, staff, date, tz, locale, t],
  );
  const visibleFocus = mobile ? (preview?.blocks[0]?.staffId ?? focus) : focus;
  const columns =
    mobile && visibleFocus !== "all" ? staff.filter((s) => s.id === visibleFocus) : staff;
  const nowMinutes = date === today ? minutesInZone(new Date(), tz) : null;
  const canCreate = (ws.role ?? "staff") !== "staff";

  const previewStart = preview?.blocks[0]?.startsAt ?? null;
  useEffect(() => {
    if (!previewStart) {
      scrolledPreview.current = null;
      return;
    }
    if (scrolledPreview.current === previewStart) return;
    const minutes = minutesInZone(new Date(previewStart), tz);
    scroll.current?.scrollTo({
      y: Math.max(0, gridY + (minutes / 60 - range.startHour - 1) * (mobile ? 64 : 56)),
      animated: !reduceMotion,
    });
    scrolledPreview.current = previewStart;
  }, [previewStart, gridY, range.startHour, mobile, tz, reduceMotion]);

  useEffect(() => {
    if (
      !savedBooking ||
      scrolledBooking.current === savedBooking.id ||
      !items.some((b) => b.id === savedBooking.id)
    )
      return;
    const minutes = minutesInZone(new Date(savedBooking.startsAt), tz);
    // Leave one hour above the newly saved block, including late appointments below the fold.
    scroll.current?.scrollTo({
      y: Math.max(0, gridY + (minutes / 60 - range.startHour - 1) * (mobile ? 64 : 56)),
      animated: !reduceMotion,
    });
    scrolledBooking.current = savedBooking.id;
  }, [savedBooking, items, gridY, range.startHour, mobile, tz, reduceMotion]);

  const openBooking = (id: string) => {
    setOpen(items.find((b) => b.id === id) ?? null);
  };
  // `?booking=<id>` (e.g. from a payroll commission line): shown once the day has loaded; closing
  // it clears the param.
  const linked = params.booking ? (items.find((x) => x.id === params.booking) ?? null) : null;
  const shown = open ?? linked;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      ref={scroll}
      contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}
    >
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
      {loadFailed && !noCalendarData ? (
        <QueryError
          busy={day.bookings.isFetching || day.team.isFetching || day.settings.isFetching}
          onRetry={retryCalendar}
        />
      ) : null}

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
                  minHeight: MIN_TOUCH,
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

      <View
        style={{ marginRight: bp === "wide" && sheet ? 520 : 0 }}
        onLayout={(event) => {
          setGridY(event.nativeEvent.layout.y);
        }}
      >
        <CalmCard style={{ gap: 12 }}>
          {loadFailed && noCalendarData ? (
            <QueryError
              busy={day.bookings.isFetching || day.team.isFetching || day.settings.isFetching}
              onRetry={retryCalendar}
            />
          ) : day.bookings.isPending || (can("members.read") && day.team.isPending) ? (
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
          ) : mobile && visibleFocus === "all" ? (
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
              draft={preview}
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
      </View>

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
      {sheet ? (
        <NewAppointmentSheet
          services={day.services.data?.items ?? []}
          staff={staff}
          tz={tz}
          prefill={sheet}
          onPreviewChange={updatePreview}
          onCreated={(booking) => {
            const bookedDate = salonDate(new Date(booking.startsAt), tz);
            setDate(bookedDate);
            setCreating(null);
            setPreview(null);
            router.setParams({ date: bookedDate, new: undefined });
            if (mobile) setFocus(booking.staffId);
            setSavedBooking(booking);
          }}
          onClose={closeNew}
        />
      ) : null}
    </ScrollView>
  );
}

const ALL = "all";

const navBtn = (border: string, bg: string) =>
  ({
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: bg,
    alignItems: "center",
    justifyContent: "center",
  }) as const;
