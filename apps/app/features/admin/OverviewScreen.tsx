import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import type { AdminUsageItem } from "@gugu/contracts";
import { CalmButton, Pill, ProgressBar, StatCard, Text, useCalm } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useBreakpoint } from "../salon-crm/shell/useBreakpoint";
import { Segmented } from "../salon-crm/ui/form";
import { useAdminUsage } from "./data";
import { fmtDate, fmtLimit, fmtNumber, monthVn } from "./format";
import { LoadError, Loading, Page, Section } from "./ui";

/** Usage overview (M12.6): AI cost per salon vs the hard caps, Zalo template sends, trials ending. */
export function OverviewScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const router = useRouter();
  const [which, setWhich] = useState<"this" | "last">("this");
  const month = which === "this" ? monthVn(0) : monthVn(-1);
  const usage = useAdminUsage(month);
  const first = usage.data?.pages[0];
  const items = usage.data?.pages.flatMap((p) => p.items) ?? [];
  const open = (salonId: string) => {
    router.push(`/${locale}/admin/salons/${salonId}` as never);
  };

  return (
    <Page
      testID="admin-overview"
      title={t("overview.title")}
      subtitle={t("overview.subtitle", { month })}
      actions={
        <Segmented
          value={which}
          onChange={setWhich}
          options={[
            { id: "this", label: t("overview.thisMonth") },
            { id: "last", label: t("overview.lastMonth") },
          ]}
        />
      }
    >
      {usage.isPending ? (
        <Loading />
      ) : usage.isError || !first ? (
        <LoadError onRetry={() => void usage.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            <StatCard
              testID="admin-stat-salons"
              label={t("overview.stats.salons")}
              value={fmtNumber(first.totals.salons, locale)}
              emptyCaption=""
            />
            <StatCard
              testID="admin-stat-ai"
              label={t("overview.stats.aiCost")}
              value={formatVND(first.totals.aiCostVnd, locale)}
              emptyCaption=""
            />
            <StatCard
              label={t("overview.stats.nearCap")}
              value={fmtNumber(first.totals.nearAiCap, locale)}
              emptyCaption=""
            />
            <StatCard
              label={t("overview.stats.zaloTemplates")}
              value={fmtNumber(first.totals.zaloTemplateSent, locale)}
              caption={
                <Text size={12} color={c.muted}>
                  {t("overview.stats.zaloCost", {
                    amount: formatVND(first.totals.zaloTemplateCostVnd, locale),
                  })}
                </Text>
              }
              emptyCaption=""
            />
          </View>
          <Text size={12} color={c.muted}>
            {t("overview.costNote")}
          </Text>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}
          >
            <View style={{ flex: 1, minWidth: 300 }}>
              <Section testID="admin-trials-ending" title={t("overview.trialsTitle")}>
                {first.trialsEndingSoon.length === 0 ? (
                  <Text size={14} color={c.muted}>
                    {t("overview.trialsEmpty")}
                  </Text>
                ) : (
                  first.trialsEndingSoon.map((tr) => (
                    <Pressable
                      key={tr.salonId}
                      accessibilityRole="link"
                      onPress={() => {
                        open(tr.salonId);
                      }}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 8,
                        paddingVertical: 8,
                        borderTopWidth: 1,
                        borderTopColor: c.line,
                      }}
                    >
                      <Text
                        role="uiMedium"
                        size={14}
                        color={c.ink}
                        numberOfLines={1}
                        style={{ flex: 1 }}
                      >
                        {tr.name}
                      </Text>
                      <Text size={13} color={c.body}>
                        {t("overview.trialEnds", { date: fmtDate(tr.trialEndsAt, locale) })}
                      </Text>
                    </Pressable>
                  ))
                )}
              </Section>
            </View>
            <View style={{ flex: 1, minWidth: 300 }}>
              <Section title={t("overview.byPlan")}>
                {first.totals.byPlan.map((p) => (
                  <View
                    key={p.plan}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 8,
                      paddingVertical: 6,
                    }}
                  >
                    <Pill label={t(`plan.${p.plan}`)} tone="accent" />
                    <Text size={13} color={c.body}>
                      {t("overview.byPlanRow", {
                        count: p.salons,
                        ai: formatVND(p.aiCostVnd, locale),
                        zalo: formatVND(p.zaloTemplateCostVnd, locale),
                      })}
                    </Text>
                  </View>
                ))}
              </Section>
            </View>
          </View>
          <Section testID="admin-usage-table" title={t("overview.usageTitle")}>
            {items.length === 0 ? (
              <Text size={14} color={c.muted}>
                {t("overview.usageEmpty")}
              </Text>
            ) : (
              <>
                <UsageHeader />
                {items.map((it) => (
                  <UsageRow
                    key={it.salonId}
                    item={it}
                    onPress={() => {
                      open(it.salonId);
                    }}
                  />
                ))}
              </>
            )}
            {usage.hasNextPage ? (
              <CalmButton
                variant="secondary"
                size="sm"
                label={t("overview.loadMore")}
                onPress={() => void usage.fetchNextPage()}
              />
            ) : null}
          </Section>
        </>
      )}
    </Page>
  );
}

function UsageHeader() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const mobile = useBreakpoint() === "mobile";
  if (mobile) return null;
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingBottom: 6 }}>
      <Text role="uiMedium" size={12} color={c.muted} style={{ flex: 2 }}>
        {t("overview.col.salon")}
      </Text>
      <Text role="uiMedium" size={12} color={c.muted} style={{ width: 80 }}>
        {t("overview.col.plan")}
      </Text>
      <Text role="uiMedium" size={12} color={c.muted} style={{ flex: 2 }}>
        {t("overview.col.ai")}
      </Text>
      <Text role="uiMedium" size={12} color={c.muted} style={{ flex: 1 }}>
        {t("overview.col.zalo")}
      </Text>
    </View>
  );
}

function UsageRow({ item, onPress }: { item: AdminUsageItem; onPress: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const mobile = useBreakpoint() === "mobile";
  const unlimited = t("common.unlimited");
  const share = item.aiCapShare ?? 0;
  return (
    <Pressable
      testID={`admin-usage-row-${item.salonId}`}
      accessibilityRole="link"
      onPress={onPress}
      style={{
        flexDirection: mobile ? "column" : "row",
        alignItems: mobile ? "flex-start" : "center",
        gap: mobile ? 6 : 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      <Text
        role="uiMedium"
        size={14}
        color={c.ink}
        numberOfLines={1}
        style={mobile ? undefined : { flex: 2 }}
      >
        {item.name}
      </Text>
      <View style={mobile ? undefined : { width: 80 }}>
        <Pill label={t(`plan.${item.plan ?? "none"}`)} tone="accent" />
      </View>
      <View style={[{ gap: 4 }, mobile ? { alignSelf: "stretch" } : { flex: 2 }]}>
        <Text size={13} color={share >= 0.8 ? c.attention : c.body}>
          {t("overview.aiOfCap", {
            used: formatVND(item.aiCostVnd, locale),
            cap: fmtLimit(item.aiCapVnd, locale, unlimited, true),
          })}
        </Text>
        <ProgressBar value={share} width="100%" />
      </View>
      <Text size={13} color={c.body} style={mobile ? undefined : { flex: 1 }}>
        {t("overview.zaloOfLimit", {
          sent: fmtNumber(item.zaloTemplateSent, locale),
          limit: fmtLimit(item.zaloTemplateLimit, locale, unlimited),
        })}
      </Text>
    </Pressable>
  );
}
