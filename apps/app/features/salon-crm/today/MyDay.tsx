import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type { SalonBooking } from "@gugu/contracts";
import { formatDateLong, formatTime } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { customerLabel } from "../data/bookings";
import type { Workspace } from "../data/types";
import { BookingSheet } from "../pages/calendar/BookingSheet";
import { PageHeader } from "../shell/PageHeader";
import { useCrmNav } from "../shell/useCrmNav";
import { EmptyState } from "../ui/EmptyState";
import { MyEarningsCard } from "./MonthCards";

const ACTIVE = new Set(["pending", "confirmed", "checked_in"]);
const DONE = new Set(["completed", "no_show"]);

/**
 * Staff "my day" (07, staff role): the next client up front with one-tap open / call, then the
 * rest of today's own appointments. Data is the member's own scope (the API filters).
 */
export function MyDay({ ws, title, subtitle }: { ws: Workspace; title: string; subtitle: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { go } = useCrmNav();
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const day = [...ws.todayBookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const next =
    day.find((b) => b.status === "checked_in") ??
    day.find((b) => ACTIVE.has(b.status) && Date.parse(b.endsAt) > now) ??
    null;
  const done = day.filter((b) => DONE.has(b.status)).length;
  const left = day.filter((b) => ACTIVE.has(b.status)).length;
  const opened = day.find((b) => b.id === openId) ?? null;
  const labels = { walkIn: t("myDay.walkIn"), deleted: t("booking.deletedCustomer") };
  const name = (b: SalonBooking) => (locale === "en" && b.service.name.en) || b.service.name.vi;

  return (
    <ScrollView testID="crm-my-day" contentContainerStyle={{ padding: 16, gap: 14 }}>
      <PageHeader title={title} subtitle={subtitle} workspace={ws} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pill tone="accent" label={t("myDay.total", { count: day.length })} />
        <Pill tone="up" label={t("myDay.done", { count: done })} />
        <Pill label={t("myDay.left", { count: left })} />
      </View>
      {next ? (
        <CalmCard testID="crm-my-day-next" style={{ gap: 10, backgroundColor: c.accentSoft }}>
          <Text
            role="uiSemiBold"
            size={12}
            color={c.accent}
            style={{ letterSpacing: 0.6, textTransform: "uppercase" }}
          >
            {next.status === "checked_in" ? t("myDay.now") : t("myDay.next")}
          </Text>
          <Text role="uiSemiBold" size={28} color={c.ink}>
            {`${formatTime(new Date(next.startsAt), locale, ws.timeZone)} – ${formatTime(new Date(next.endsAt), locale, ws.timeZone)}`}
          </Text>
          <Text role="uiSemiBold" size={18} color={c.ink}>
            {customerLabel(next, labels)}
          </Text>
          <Text size={14} color={c.body}>
            {name(next)}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <CalmButton
              testID="crm-my-day-open"
              icon="check"
              label={t("myDay.open")}
              onPress={() => {
                setOpenId(next.id);
              }}
            />
            {next.customer?.phone && !next.customer.phone.includes("•") ? (
              <CalmButton
                variant="secondary"
                icon="link"
                label={t("myDay.call")}
                onPress={() => {
                  void Linking.openURL(`tel:${next.customer?.phone ?? ""}`);
                }}
              />
            ) : null}
          </View>
        </CalmCard>
      ) : null}
      <CalmCard style={{ gap: 4 }}>
        <Text
          role="uiSemiBold"
          size={12}
          color={c.ink}
          style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
        >
          {t("myDay.today", { date: formatDateLong(new Date(), locale, ws.timeZone) })}
        </Text>
        {day.length === 0 ? (
          <EmptyState
            testID="crm-my-day-empty"
            icon="calendar"
            title={t("myDay.emptyTitle")}
            body={t("myDay.emptyBody")}
          />
        ) : (
          day.map((b) => (
            <Pressable
              key={b.id}
              testID={`crm-my-day-${b.id}`}
              accessibilityRole="button"
              onPress={() => {
                setOpenId(b.id);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderColor: c.line,
                opacity: DONE.has(b.status) || b.status.startsWith("cancelled") ? 0.55 : 1,
              }}
            >
              <Text role="uiSemiBold" size={15} color={c.ink} style={{ width: 56 }}>
                {formatTime(new Date(b.startsAt), locale, ws.timeZone)}
              </Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text role="uiMedium" size={15} color={c.ink} numberOfLines={1}>
                  {customerLabel(b, labels)}
                </Text>
                <Text size={13} color={c.body} numberOfLines={1}>
                  {name(b)}
                </Text>
              </View>
              <Pill size={10} label={t(`booking.status.${b.status}`, { defaultValue: b.status })} />
              <Icon name="chevronRight" size={14} color={c.muted} />
            </Pressable>
          ))
        )}
      </CalmCard>
      <MyEarningsCard />
      <CalmButton
        variant="secondary"
        icon="calendar"
        label={t("myDay.week")}
        onPress={() => {
          go("/business/calendar");
        }}
      />
      {opened ? (
        <BookingSheet
          key={opened.id}
          booking={opened}
          staff={ws.today.staff.map((s) => ({ id: s.id, displayName: s.name }))}
          tz={ws.timeZone}
          onClose={() => {
            setOpenId(null);
          }}
        />
      ) : null}
    </ScrollView>
  );
}
