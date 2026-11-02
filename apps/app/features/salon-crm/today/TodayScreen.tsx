import { useMemo, useState } from "react";
import { Redirect } from "expo-router";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, useCalm } from "@gugu/design-system";
import { formatDateLong } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { Timeline } from "../calendar/Timeline";
import { hourRange } from "../data/bookings";
import { minutesInZone } from "../data/dates";
import { BookingSheet } from "../pages/calendar/BookingSheet";
import { isSetupDismissed } from "../pages/setup/firstRun";
import { useOptionalSalon } from "../data/SalonContext";
import { useWorkspace } from "../data/useWorkspace";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";
import { useCrmNav } from "../shell/useCrmNav";
import { CardHeader } from "../ui/CardHeader";
import { EmptyState } from "../ui/EmptyState";
import { greetingKey } from "./greeting";
import { KpiRow } from "./KpiRow";
import { ActivityCard, UpcomingCard } from "./RailCards";
import { SetupCard } from "./SetupCard";
import { ZaloWaitingCard } from "./ZaloWaitingCard";
import { WeekStrip } from "./WeekStrip";

/** Overview / Today (07 §3.2, ref crm-01): greeting, setup checklist, KPIs, timeline, right rail. */
export function TodayScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const locale = useLocale();
  const bp = useBreakpoint();
  const { go } = useCrmNav();
  const ws = useWorkspace();
  const salonId = useOptionalSalon()?.salonId ?? "";
  // First run: a fresh salon (only registration done) starts in the setup stepper.
  const firstRun =
    !ws.demo &&
    ws.setupLoaded &&
    ws.role === "owner" &&
    ws.setupDone.every((s) => s === "business") &&
    !isSetupDismissed(salonId);
  const [openId, setOpenId] = useState<string | null>(null);
  const openBooking = (id: string) => {
    setOpenId(id);
  };
  const opened = ws.todayBookings.find((b) => b.id === openId) ?? null;
  const sheet = opened ? (
    <BookingSheet
      key={opened.id}
      booking={opened}
      staff={ws.today.staff.map((s) => ({ id: s.id, displayName: s.name }))}
      tz={ws.timeZone}
      onClose={() => {
        setOpenId(null);
      }}
    />
  ) : null;
  const now = useMemo(() => new Date(), []);
  const greeting = t(`greeting.${greetingKey(now)}`);
  const title = ws.user
    ? t("greeting.named", { greeting, name: ws.user.firstName })
    : t("greeting.plain", { greeting });
  const subtitle = t("greeting.subtitle", { date: formatDateLong(now, locale) });
  // Owners/managers see the checklist until the salon is live; staff never do.
  const setupIncomplete =
    ws.setupLoaded &&
    !ws.setupDone.includes("live") &&
    (ws.role === "owner" || ws.role === "manager");
  const mobile = bp === "mobile";

  const timeline = (
    <CalmCard style={{ flex: 1, gap: 16, minWidth: 0 }}>
      <CardHeader
        title={t("timeline.title")}
        subtitle={t("timeline.subtitle")}
        right={
          <CalmButton
            size="sm"
            variant="secondary"
            label={t("timeline.today")}
            onPress={() => {
              go("/business/calendar");
            }}
          />
        }
      />
      {ws.today.staff.length === 0 ? (
        <EmptyState
          testID="crm-timeline-empty"
          icon="calendar"
          title={t("timeline.emptyTitle")}
          body={t("timeline.emptyBody")}
        />
      ) : (
        <Timeline
          staff={ws.today.staff}
          items={ws.today.items}
          timeZone={ws.timeZone}
          {...(ws.demo
            ? {}
            : hourRange([], [], ws.todayBookings, "", ws.timeZone, (iso) =>
                minutesInZone(new Date(iso), ws.timeZone),
              ))}
          nowMinutes={ws.demo ? null : minutesInZone(new Date(), ws.timeZone)}
          onPressItem={ws.demo ? undefined : openBooking}
        />
      )}
    </CalmCard>
  );

  if (firstRun) return <Redirect href={`/${locale}/business/setup` as never} />;

  if (mobile) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {ws.demo ? <Pill label={tc("demo.notice")} tone="brand" /> : null}
        <PageHeader title={title} subtitle={subtitle} workspace={ws} />
        {setupIncomplete && !ws.demo ? (
          <SetupCard done={ws.setupDone} canGoLive={ws.canGoLive} compact />
        ) : null}
        <ZaloWaitingCard />
        <WeekStrip now={now} />
        <KpiRow today={ws.today} only="revenue" />
        <UpcomingCard items={ws.today.upcoming} onPress={ws.demo ? undefined : openBooking} />
        {sheet}
      </ScrollView>
    );
  }

  const rail = (
    <View style={{ width: 300, gap: 16 }}>
      <UpcomingCard items={ws.today.upcoming} onPress={ws.demo ? undefined : openBooking} />
      <ActivityCard items={ws.today.activity} />
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: c.canvas }}
      contentContainerStyle={{ padding: 28, gap: 20 }}
    >
      <PageHeader title={title} subtitle={subtitle} workspace={ws} />
      {setupIncomplete && !ws.demo ? (
        <SetupCard done={ws.setupDone} canGoLive={ws.canGoLive} />
      ) : null}
      <ZaloWaitingCard />
      <KpiRow today={ws.today} />
      {bp === "wide" ? (
        <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
          {timeline}
          {rail}
        </View>
      ) : (
        <>
          {timeline}
          <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <UpcomingCard items={ws.today.upcoming} onPress={ws.demo ? undefined : openBooking} />
            </View>
            <View style={{ flex: 1 }}>
              <ActivityCard items={ws.today.activity} />
            </View>
          </View>
        </>
      )}
      {sheet}
    </ScrollView>
  );
}
