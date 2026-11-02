import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmCard, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import { formatTime, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import type { ActivityItem, UpcomingItem } from "../data/types";
import { CardHeader } from "../ui/CardHeader";
import { EmptyState } from "../ui/EmptyState";

/** Right rail: upcoming appointments & live queue (ref crm-01). Prices are booking estimates. */
export function UpcomingCard({
  items,
  onPress,
}: {
  items: UpcomingItem[];
  onPress?: ((id: string) => void) | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  return (
    <CalmCard testID="crm-upcoming" style={{ gap: 14 }}>
      <CardHeader title={t("upcoming.title")} subtitle={t("upcoming.subtitle")} />
      {items.length === 0 ? (
        <EmptyState compact icon="clock" title={t("upcoming.empty")} />
      ) : (
        items.map((u) => (
          <Pressable
            key={u.id}
            testID={`crm-upcoming-${u.id}`}
            accessibilityRole="button"
            disabled={!onPress}
            onPress={() => {
              onPress?.(u.id);
            }}
            style={{
              flexDirection: "row",
              gap: 10,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: u.status === "completed" ? c.ink : c.line,
            }}
          >
            <Avatar name={u.customer} size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text role="uiSemiBold" size={14} color={c.ink} numberOfLines={1}>
                {`${u.customer} · ${formatTime(u.start, locale)}`}
              </Text>
              <Text role="uiMedium" size={13} color={c.ink} numberOfLines={1}>
                {u.service}
              </Text>
              <Text size={12} color={c.body}>
                {`(${u.staff})`}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                  flexWrap: "wrap",
                }}
              >
                <Text role="uiSemiBold" size={13} color={c.ink}>
                  {formatVND(u.estimatedVnd, locale)}
                </Text>
                <Pill
                  label={t(`timeline.status.${u.status}`)}
                  tone={u.status === "pending" ? "brand" : "accent"}
                  size={11}
                />
              </View>
            </View>
            {u.status === "completed" ? <Icon name="check" size={16} color={c.ink} /> : null}
            {u.status === "pending" ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: c.event.pending.border,
                  marginTop: 4,
                }}
              />
            ) : null}
          </Pressable>
        ))
      )}
    </CalmCard>
  );
}

/** Latest activity: bookings created / checked in / completed with their estimated value. */
export function ActivityCard({ items }: { items: ActivityItem[] }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  return (
    <CalmCard testID="crm-activity" style={{ gap: 12 }}>
      <CardHeader title={t("activity.title")} />
      {items.length === 0 ? (
        <EmptyState compact icon="sparkles" title={t("activity.empty")} />
      ) : (
        <>
          {items.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor:
                    a.kind === "completed"
                      ? c.event.completed.border
                      : a.kind === "checkedIn"
                        ? c.event.inProgress.border
                        : c.accentBg,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text size={13} color={c.ink} numberOfLines={1}>
                  {a.service}
                </Text>
                <Text size={12} color={c.body}>
                  {t(`activity.${a.kind}`, { time: formatTime(a.at, locale) })}
                </Text>
              </View>
              <Text role="uiMedium" size={13} color={c.ink}>
                {formatVND(a.estimatedVnd, locale)}
              </Text>
            </View>
          ))}
          <Pill label={t("revenueKind.estimated")} tone="accent" size={11} />
        </>
      )}
    </CalmCard>
  );
}
