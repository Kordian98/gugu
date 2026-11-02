import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Text, useCalm } from "@gugu/design-system";
import type { ZaloStats } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useOptionalSalon } from "../../data/SalonContext";
import { useZaloStats } from "../../data/zalo";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { Field, Input } from "../../ui/form";

type Preset = "today" | "d7" | "d30" | "custom";
const PRESETS: Preset[] = ["today", "d7", "d30", "custom"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const localToday = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date());
const minusDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/**
 * Zalo statistics (owner request 2026-11-03): contacts, the assistant's booking funnel with drop-off
 * per step, why bookings didn't happen, button actions, reminders, staff work and message costs.
 * Calm style: one accent hue for bars, every number also written as text.
 */
export function ZaloStatsView() {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const timeZone = useOptionalSalon()?.summary?.timezone ?? "Asia/Ho_Chi_Minh";
  const today = localToday(timeZone);
  const [preset, setPreset] = useState<Preset>("d7");
  const [custom, setCustom] = useState({ from: minusDays(today, 13), to: today });
  const [draft, setDraft] = useState(custom);
  const range =
    preset === "today"
      ? { from: today, to: today }
      : preset === "d7"
        ? { from: minusDays(today, 6), to: today }
        : preset === "d30"
          ? { from: minusDays(today, 29), to: today }
          : custom;
  const stats = useZaloStats(range.from, range.to, true);
  const draftValid =
    DATE.test(draft.from) &&
    DATE.test(draft.to) &&
    draft.from <= draft.to &&
    Date.parse(draft.to) - Date.parse(draft.from) <= 365 * 86_400_000;

  return (
    <View style={{ gap: 16 }} testID="zalo-stats">
      <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <Chip
            key={p}
            label={t(`panel.stats.period.${p}`)}
            selected={preset === p}
            onPress={() => {
              setPreset(p);
            }}
          />
        ))}
      </View>
      {preset === "custom" ? (
        <CalmCard style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label={t("panel.stats.period.from")} flex={1}>
              <Input
                label={t("panel.stats.period.from")}
                value={draft.from}
                placeholder="2026-11-01"
                onChangeText={(v) => {
                  setDraft((d) => ({ ...d, from: v.trim() }));
                }}
              />
            </Field>
            <Field label={t("panel.stats.period.to")} flex={1}>
              <Input
                label={t("panel.stats.period.to")}
                value={draft.to}
                placeholder="2026-11-30"
                onChangeText={(v) => {
                  setDraft((d) => ({ ...d, to: v.trim() }));
                }}
              />
            </Field>
            <CalmButton
              label={t("panel.stats.period.apply")}
              onPress={() => {
                if (draftValid) setCustom(draft);
              }}
            />
          </View>
          {!draftValid ? (
            <Text size={12} color={c.attention}>
              {t("panel.stats.period.invalid")}
            </Text>
          ) : null}
        </CalmCard>
      ) : null}
      {stats.isPending ? <ActivityIndicator color={c.accent} /> : null}
      {stats.data ? <StatsBody s={stats.data} /> : null}
    </View>
  );
}

function StatsBody({ s }: { s: ZaloStats }) {
  const { t } = useTranslation("zalo");
  const locale = useLocale();
  const bp = useBreakpoint();
  const pct = (v: number) =>
    new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(v);
  const empty =
    s.funnel.sessions === 0 && s.contacts.uniqueCustomers === 0 && s.costs.totalVnd === 0;
  if (empty) {
    return (
      <CalmCard>
        <EmptyState icon="chart" title={t("panel.stats.empty")} />
      </CalmCard>
    );
  }
  const wide = bp !== "mobile";
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Tile label={t("panel.stats.kpi.customers")} value={String(s.contacts.uniqueCustomers)} />
        <Tile label={t("panel.stats.kpi.sessions")} value={String(s.funnel.sessions)} />
        <Tile label={t("panel.stats.kpi.bookings")} value={String(s.funnel.bookings)} />
        <Tile label={t("panel.stats.kpi.conversion")} value={pct(s.funnel.conversionRate)} />
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 16, alignItems: "flex-start" }}>
        <Funnel s={s} pct={pct} />
        <Lost s={s} />
      </View>
      <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
        <Facts
          title={t("panel.stats.contactsTitle")}
          rows={[
            [t("panel.stats.followers"), s.contacts.newFollowers],
            [t("panel.stats.unfollows"), s.contacts.unfollows],
            [t("panel.stats.conversations"), s.contacts.conversationsStarted],
            [t("panel.stats.notUnderstood"), s.notUnderstood],
          ]}
        />
        <Facts
          title={t("panel.stats.actionsTitle")}
          rows={[
            [t("panel.stats.cancelled"), s.bookingActions.cancelled],
            [t("panel.stats.rescheduled"), s.bookingActions.rescheduled],
            [t("panel.stats.attendance"), s.bookingActions.attendanceConfirmed],
          ]}
        />
        <Facts
          title={t("panel.stats.remindersTitle")}
          rows={[
            [t("panel.stats.sent"), s.reminders.sent],
            [t("panel.stats.notSent"), s.reminders.notSent],
            [t("panel.stats.failedSends"), s.reminders.failed],
            [t("panel.stats.attendance"), s.bookingActions.attendanceConfirmed],
          ]}
        />
        <Facts
          title={t("panel.stats.staffTitle")}
          rows={[
            [t("panel.stats.handoffs"), s.staff.handoffs],
            [t("panel.stats.takeovers"), s.staff.takeovers],
            [t("panel.stats.staffConversations"), s.staff.staffHandledConversations],
            [t("panel.stats.staffReplies"), s.staff.staffReplies],
          ]}
        />
        <Facts
          title={t("panel.stats.costsTitle")}
          note={t("panel.stats.costNote")}
          rows={[
            [t("panel.stats.total"), formatVND(s.costs.totalVnd, locale)],
            [
              t("panel.stats.templates"),
              `${String(s.costs.templates)} · ${formatVND(s.costs.templateVnd, locale)}`,
            ],
            [
              t("panel.stats.paid"),
              `${String(s.costs.paidMessages)} · ${formatVND(s.costs.paidMessagesVnd, locale)}`,
            ],
            [t("panel.stats.free"), s.costs.freeMessages],
          ]}
        />
      </View>
    </View>
  );
}

function Funnel({ s, pct }: { s: ZaloStats; pct: (v: number) => string }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const max = Math.max(1, s.funnel.sessions);
  const rows = [
    ...s.funnel.steps.map((x) => ({
      key: x.step,
      label: t(`panel.stats.step.${x.step}`),
      value: x.reached,
      line: t("panel.stats.stepLine", {
        reached: x.reached,
        drop: x.dropOff,
        rate: pct(x.dropOffRate),
      }),
    })),
    {
      key: "booked",
      label: t("panel.stats.step.booked"),
      value: s.funnel.bookings,
      line: String(s.funnel.bookings),
    },
  ];
  return (
    <CalmCard style={{ flex: 1, gap: 12, width: "100%" }} testID="zalo-stats-funnel">
      <Text role="uiSemiBold" size={15} color={c.ink}>
        {t("panel.stats.funnelTitle")}
      </Text>
      {rows.map((r) => (
        <View key={r.key} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text role="uiMedium" size={13} color={c.ink} style={{ flex: 1 }}>
              {r.label}
            </Text>
            <Text size={12} color={c.body}>
              {r.line}
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: 4, backgroundColor: c.surfaceMuted }}>
            <View
              style={{
                width: `${String(Math.round((r.value / max) * 100))}%`,
                height: 10,
                borderRadius: 4,
                backgroundColor: c.accentBg,
              }}
            />
          </View>
        </View>
      ))}
      {s.funnel.inProgress > 0 ? (
        <Text size={12} color={c.muted}>
          {t("panel.stats.inProgress", { count: s.funnel.inProgress })}
        </Text>
      ) : null}
      <Text size={12} color={c.muted}>
        {t("panel.stats.funnelHint")}
      </Text>
    </CalmCard>
  );
}

function Lost({ s }: { s: ZaloStats }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const total = Math.max(
    1,
    s.lostReasons.reduce((n, r) => n + r.count, 0),
  );
  const label = (reason: string) => {
    if (reason.startsWith("abandoned:")) {
      const step = reason.slice("abandoned:".length) as "service";
      return t("panel.stats.reason.abandoned", { step: t(`panel.stats.step.${step}`) });
    }
    return t(`panel.stats.reason.${reason as "handoff"}`, { defaultValue: reason });
  };
  return (
    <CalmCard style={{ flex: 1, gap: 12, width: "100%" }} testID="zalo-stats-lost">
      <Text role="uiSemiBold" size={15} color={c.ink}>
        {t("panel.stats.lostTitle")}
      </Text>
      {s.lostReasons.length === 0 ? (
        <Text size={13} color={c.body}>
          {t("panel.stats.lostNone")}
        </Text>
      ) : null}
      {s.lostReasons.map((r) => (
        <View key={r.reason} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text size={13} color={c.ink} style={{ flex: 1 }}>
              {label(r.reason)}
            </Text>
            <Text role="uiMedium" size={13} color={c.ink}>
              {String(r.count)}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceMuted }}>
            <View
              style={{
                width: `${String(Math.round((r.count / total) * 100))}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: c.accentBg,
              }}
            />
          </View>
        </View>
      ))}
    </CalmCard>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  const { c } = useCalm();
  return (
    <CalmCard style={{ flex: 1, minWidth: 150, gap: 4 }}>
      <Text size={12} color={c.muted}>
        {label}
      </Text>
      <Text role="uiSemiBold" size={24} color={c.ink}>
        {value}
      </Text>
    </CalmCard>
  );
}

function Facts({
  title,
  rows,
  note,
}: {
  title: string;
  rows: [string, number | string][];
  note?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <CalmCard style={{ flex: 1, minWidth: 220, gap: 8 }}>
      <Text role="uiSemiBold" size={14} color={c.ink}>
        {title}
      </Text>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", gap: 8 }}>
          <Text size={13} color={c.body} style={{ flex: 1 }}>
            {label}
          </Text>
          <Text role="uiMedium" size={13} color={c.ink}>
            {String(value)}
          </Text>
        </View>
      ))}
      {note ? (
        <Text size={11} color={c.muted}>
          {note}
        </Text>
      ) : null}
    </CalmCard>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        height: 34,
        borderRadius: 999,
        justifyContent: "center",
        backgroundColor: selected ? c.accentSoft : c.surfaceMuted,
      }}
    >
      <Text role="uiMedium" size={13} color={selected ? c.accent : c.body}>
        {label}
      </Text>
    </Pressable>
  );
}
