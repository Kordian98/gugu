import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Pill, ProgressBar, Text, useCalm } from "@gugu/design-system";
import { type Profit, SALON_COST_CATEGORIES, type SalonCost } from "@gugu/contracts";
import { formatMonth, formatPercent, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { salonDate } from "../../data/dates";
import { useCreateCost, useProfit, useRemoveCost, useUpdateCost } from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { EmptyState } from "../../ui/EmptyState";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, MoneyInput, Segmented, Sheet } from "../../ui/form";
import { waterfall, waterfallRange, type WaterfallStep } from "../payroll/model";
import {
  MonthSwitcher,
  Note,
  RetryError,
  SectionTitle,
  signedVnd,
  SkeletonRows,
} from "../payroll/parts";

/**
 * The headline numbers (≤ 4 per view, skill UX rule 7); keys from the metric catalogue. The first
 * one is THE headline (estimated net profit), the other three sit under it, smaller.
 */
export const PROFIT_HEADLINE = [
  "profit.net",
  "profit.revenue_earned",
  "profit.revenue_upcoming",
  "profit.net_margin",
] as const;
type HeadlineKey = (typeof PROFIT_HEADLINE)[number];

const TILE_NOTE = {
  "profit.revenue_earned": "profit.tileNote.profit_revenue_earned",
  "profit.revenue_upcoming": "profit.tileNote.profit_revenue_upcoming",
  "profit.net_margin": "profit.tileNote.profit_net_margin",
} as const;

const KIND_LABEL = {
  estimated_from_bookings: "revenueKind.estimated",
  recorded_offline_sale: "revenueKind.offline",
  reported_by_salon: "revenueKind.reported",
} as const;

const keyOf = (k: string) => k.replace(/\./g, "_");

/**
 * Owner "This month" (ADR-0016, redesigned after the owner's review 2026-11-03): ONE headline —
 * the estimated net profit — and a waterfall revenue → service costs → payroll → other costs →
 * net, every bar split into what already happened (solid) and what is still expected (light,
 * dashed). Other monthly costs are edited right here.
 */
export function ProfitView() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { summary } = useSalon();
  const [month, setMonth] = useState(salonDate(new Date(), summary?.timezone).slice(0, 7));
  const q = useProfit(month);
  const p = q.data?.data ?? null;
  return (
    <View testID="crm-profit" style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <MonthSwitcher testID="crm-profit-month" month={month} onChange={setMonth} />
        {p ? (
          <View style={{ flex: 1, minWidth: 200, gap: 6 }}>
            <Text size={14} color={c.body}>
              {t("profit.progress", { elapsed: p.elapsedDays, days: p.daysInMonth })}
            </Text>
            <ProgressBar value={p.breakdown.monthProgress} width="100%" height={8} />
          </View>
        ) : null}
      </View>
      {q.isPending ? (
        <CalmCard>
          <SkeletonRows />
        </CalmCard>
      ) : q.isError ? (
        <CalmCard>
          <RetryError
            text={t("errors.loadFailed")}
            onRetry={() => {
              void q.refetch();
            }}
          />
        </CalmCard>
      ) : q.data.forbidden || !p ? (
        <EmptyState
          testID="crm-profit-forbidden"
          icon="wallet"
          title={t("profit.forbiddenTitle")}
          body={t("profit.forbiddenBody")}
        />
      ) : (
        <>
          <Headline p={p} month={month} />
          <Waterfall p={p} />
          <CostsCard month={month} costs={p.costs} total={p.breakdown.otherCosts} />
          <Note text={t("profit.note")} />
        </>
      )}
    </View>
  );
}

function metricText(p: Profit, id: HeadlineKey, locale: "vi" | "en"): string {
  const m = p.metrics[id];
  if (!m || m.value === null) return "—";
  return m.unit === "vnd" ? formatVND(m.value, locale) : formatPercent(m.value, locale);
}

/** Small "i" that reveals the registry definition (rule 7). */
function InfoToggle({ id, open, onToggle }: { id: string; open: boolean; onToggle: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  return (
    <Pressable
      testID={`crm-profit-info-${id}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={t("profit.definition")}
      onPress={onToggle}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="info" size={16} color={c.muted} />
    </Pressable>
  );
}

function Headline({ p, month }: { p: Profit; month: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [info, setInfo] = useState<string | null>(null);
  const net = p.metrics["profit.net"]?.value ?? 0;
  const small: Exclude<HeadlineKey, "profit.net">[] = [
    "profit.revenue_earned",
    "profit.revenue_upcoming",
    "profit.net_margin",
  ];
  return (
    <CalmCard style={{ gap: 16 }}>
      <View testID="crm-profit-tile-profit.net" style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text role="uiMedium" size={15} color={c.body} style={{ flex: 1 }}>
            {t("profit.headline", { month: formatMonth(month, locale) })}
          </Text>
          <InfoToggle
            id="profit.net"
            open={info === "profit.net"}
            onToggle={() => {
              setInfo((v) => (v === "profit.net" ? null : "profit.net"));
            }}
          />
        </View>
        <Text
          testID="crm-profit-value-profit.net"
          role="uiSemiBold"
          size={40}
          lineHeight={48}
          color={net < 0 ? c.attention : c.ink}
        >
          {metricText(p, "profit.net", locale)}
        </Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Pill size={12} label={t("profit.basis.mixed")} />
          <Pill size={12} tone="accent" label={t(KIND_LABEL.estimated_from_bookings)} />
          {net < 0 ? (
            <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
              <Icon name="arrowDown" size={14} color={c.attention} />
              <Text size={13} color={c.attention}>
                {t("profit.negative")}
              </Text>
            </View>
          ) : null}
        </View>
        {info === "profit.net" ? (
          <Text size={13} color={c.body}>
            {t("insights.definitions.profit_net", { defaultValue: "" })}
          </Text>
        ) : null}
      </View>
      <View
        testID="crm-profit-tiles"
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 16,
          borderTopWidth: 1,
          borderColor: c.line,
          paddingTop: 12,
        }}
      >
        {small.map((id) => {
          const m = p.metrics[id];
          return (
            <View
              key={id}
              testID={`crm-profit-tile-${id}`}
              style={{ flexBasis: 180, flexGrow: 1, gap: 2 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text size={14} color={c.body} style={{ flex: 1 }}>
                  {t(`insights.metrics.${keyOf(id)}`, { defaultValue: id })}
                </Text>
                <InfoToggle
                  id={id}
                  open={info === id}
                  onToggle={() => {
                    setInfo((v) => (v === id ? null : id));
                  }}
                />
              </View>
              <Text
                testID={`crm-profit-value-${id}`}
                role="uiSemiBold"
                size={22}
                color={m?.value !== null && (m?.value ?? 0) < 0 ? c.attention : c.ink}
              >
                {metricText(p, id, locale)}
              </Text>
              <Text size={13} color={c.muted}>
                {t(TILE_NOTE[id])}
              </Text>
              {info === id ? (
                <Text size={13} color={c.body}>
                  {t(`insights.definitions.${keyOf(id)}`, { defaultValue: "" })}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </CalmCard>
  );
}

/** One horizontal bar per step, floating from the running total before to after it. */
function Bar({ s, min, max }: { s: WaterfallStep; min: number; max: number }) {
  const { c } = useCalm();
  const span = max - min;
  const pct = (x: number) => `${String(((x - min) / span) * 100)}%` as const;
  const lo = Math.min(s.from, s.to);
  const hi = Math.max(s.from, s.to);
  const width = ((hi - lo) / span) * 100;
  const positive = s.id === "revenue" || (s.id === "net" && s.amount >= 0);
  const solid = positive ? c.accentBg : s.id === "net" ? c.attention : c.down.bg;
  const total = s.actual + s.projected;
  const actualShare = s.id === "net" || total <= 0 ? 1 : s.actual / total;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 22, borderRadius: 6, backgroundColor: c.surfaceMuted, overflow: "hidden" }}
    >
      {min < 0 ? (
        <View
          style={{
            position: "absolute",
            left: pct(0),
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: c.body,
          }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          left: pct(lo),
          width: `${String(Math.max(width, 0.5))}%`,
          top: 2,
          bottom: 2,
          flexDirection: s.amount < 0 ? "row-reverse" : "row",
        }}
      >
        <View
          style={{
            flex: actualShare,
            backgroundColor: solid,
            borderRadius: 4,
            borderWidth: s.id === "net" ? 0 : 1,
            borderColor: positive ? c.accentBg : c.attention,
          }}
        />
        {actualShare < 1 ? (
          <View
            style={{
              flex: 1 - actualShare,
              backgroundColor: positive ? c.accentSoft : c.surface,
              borderRadius: 4,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: positive ? c.accentBg : c.attention,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function Waterfall({ p }: { p: Profit }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const b = p.breakdown;
  const steps = waterfall(b);
  const { min, max } = waterfallRange(steps);
  const vnd = (n: number) => formatVND(n, locale);
  const hint = (s: WaterfallStep): string | null => {
    const parts: string[] = [];
    if (s.id === "revenue" && b.revenueEarnedRecorded > 0)
      parts.push(t("profit.recordedPart", { amount: vnd(b.revenueEarnedRecorded) }));
    if (s.id === "noShow")
      parts.push(t("profit.assumption", { rate: formatPercent(p.noShow.rate ?? 0, locale) }));
    if (s.id === "serviceCosts" && p.servicesWithoutCost > 0)
      parts.push(t("profit.missingCost", { count: p.servicesWithoutCost }));
    if (s.id === "payroll") {
      parts.push(
        t("profit.waterfall.payrollParts", {
          base: vnd(b.basePay),
          commission: vnd(b.commissionEarned + b.commissionProjected),
        }),
      );
      if (b.employerCosts > 0)
        parts.push(t("profit.waterfall.employerIncluded", { amount: vnd(b.employerCosts) }));
      if (p.payrollClosed) parts.push(t("profit.closedPayroll"));
    }
    if (s.id === "revenue" && b.noShowAllowance === 0 && b.revenueUpcoming > 0)
      parts.push(t("profit.noAssumption"));
    return parts.length ? parts.join(" ") : null;
  };
  return (
    <CalmCard testID="crm-profit-breakdown" style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <SectionTitle text={t("profit.waterfall.title")} />
        </View>
        <Legend solid label={t("profit.cols.actual")} />
        <Legend label={t("profit.cols.projected")} />
      </View>
      {steps.map((s) => {
        const h = hint(s);
        const isNet = s.id === "net";
        return (
          <View
            key={s.id}
            testID={isNet ? "crm-profit-net" : `crm-profit-row-${s.id}`}
            style={{
              gap: 6,
              paddingVertical: 12,
              borderTopWidth: isNet ? 2 : 1,
              borderColor: c.line,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text
                role={isNet ? "uiSemiBold" : "uiMedium"}
                size={isNet ? 17 : 15}
                color={c.ink}
                style={{ flex: 1 }}
              >
                {t(`profit.waterfall.steps.${s.id}`)}
              </Text>
              <Text
                role="uiSemiBold"
                size={isNet ? 22 : 16}
                color={isNet && s.amount < 0 ? c.attention : c.ink}
              >
                {isNet
                  ? `${vnd(s.amount)}${b.netMargin !== null ? ` · ${formatPercent(b.netMargin, locale)}` : ""}`
                  : s.id === "revenue"
                    ? vnd(s.amount)
                    : signedVnd(s.amount, locale)}
              </Text>
            </View>
            <Bar s={s} min={min} max={max} />
            {!isNet && (s.actual > 0 || s.projected > 0) ? (
              <Text size={13} color={c.body}>
                {s.projected > 0 && s.actual > 0
                  ? t("profit.waterfall.split", {
                      actual: vnd(s.actual),
                      projected: vnd(s.projected),
                    })
                  : s.projected > 0
                    ? t("profit.waterfall.onlyProjected", { projected: vnd(s.projected) })
                    : t("profit.waterfall.onlyActual", { actual: vnd(s.actual) })}
              </Text>
            ) : null}
            {h ? (
              <Text size={12} color={c.muted}>
                {h}
              </Text>
            ) : null}
          </View>
        );
      })}
    </CalmCard>
  );
}

function Legend({ solid, label }: { solid?: boolean; label: string }) {
  const { c } = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 18,
          height: 12,
          borderRadius: 3,
          backgroundColor: solid ? c.accentBg : c.accentSoft,
          borderWidth: 1,
          borderStyle: solid ? "solid" : "dashed",
          borderColor: c.accentBg,
        }}
      />
      <Text size={13} color={c.body}>
        {label}
      </Text>
    </View>
  );
}

function CostsCard({ month, costs, total }: { month: string; costs: SalonCost[]; total: number }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { can } = useSalon();
  const canManage = can("payroll.manage");
  const [edit, setEdit] = useState<SalonCost | "new" | null>(null);
  return (
    <CalmCard testID="crm-profit-costs" style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <SectionTitle text={t("profit.costs.title")} />
        {canManage ? (
          <CalmButton
            testID="crm-cost-add"
            size="sm"
            variant="secondary"
            icon="plus"
            label={t("profit.costs.add")}
            onPress={() => {
              setEdit("new");
            }}
          />
        ) : null}
      </View>
      {costs.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("profit.costs.empty")}
        </Text>
      ) : (
        costs.map((x) => (
          <Pressable
            key={x.id}
            testID={`crm-cost-${x.id}`}
            disabled={!canManage}
            accessibilityRole="button"
            onPress={() => {
              setEdit(x);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderColor: c.line,
              minHeight: 44,
            }}
          >
            <Text size={14} color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
              {x.name}
            </Text>
            <Pill size={10} label={t(`profit.costs.category.${x.category}`)} />
            {x.recurring ? (
              <Pill size={10} tone="accent" label={t("profit.costs.monthly")} />
            ) : null}
            <Text
              role="uiSemiBold"
              size={14}
              color={c.ink}
              style={{ minWidth: 100, textAlign: "right" }}
            >
              {formatVND(x.amount, locale)}
            </Text>
          </Pressable>
        ))
      )}
      {costs.length ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingTop: 6,
            borderTopWidth: 1,
            borderColor: c.line,
          }}
        >
          <Text role="uiSemiBold" size={14} color={c.ink}>
            {t("payroll.totals")}
          </Text>
          <Text role="uiSemiBold" size={14} color={c.ink}>
            {formatVND(total, locale)}
          </Text>
        </View>
      ) : null}
      {edit ? (
        <CostSheet
          month={month}
          cost={edit === "new" ? null : edit}
          onClose={() => {
            setEdit(null);
          }}
        />
      ) : null}
    </CalmCard>
  );
}

function CostSheet({
  month,
  cost,
  onClose,
}: {
  month: string;
  cost: SalonCost | null;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const create = useCreateCost();
  const update = useUpdateCost();
  const remove = useRemoveCost();
  const [name, setName] = useState(cost?.name ?? "");
  const [category, setCategory] = useState<SalonCost["category"]>(cost?.category ?? "rent");
  const [amount, setAmount] = useState<number | null>(cost?.amount ?? null);
  const [recurring, setRecurring] = useState(cost?.recurring ?? true);
  const [touched, setTouched] = useState(false);
  const save = () => {
    setTouched(true);
    if (!name.trim() || amount === null) return;
    if (cost)
      update.mutate(
        { id: cost.id, body: { name: name.trim(), category, amount, month } },
        { onSuccess: onClose },
      );
    else
      create.mutate(
        { name: name.trim(), category, amount, recurring, month },
        { onSuccess: onClose },
      );
  };
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={cost ? t("profit.costs.editTitle") : t("profit.costs.newTitle")}
      footer={
        <>
          {cost ? (
            <CalmButton
              variant="ghost"
              icon="trash"
              label={t("profit.costs.remove")}
              onPress={() => {
                remove.mutate({ id: cost.id, month }, { onSuccess: onClose });
              }}
            />
          ) : null}
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton testID="crm-cost-save" label={t("common.save")} onPress={save} />
        </>
      }
    >
      <ErrorBanner text={errorText(create.error ?? update.error ?? remove.error)} />
      <Field
        label={t("profit.costs.name")}
        error={touched && !name.trim() ? t("common.required") : null}
      >
        <Input
          testID="crm-cost-name"
          label={t("profit.costs.name")}
          value={name}
          onChangeText={setName}
        />
      </Field>
      <Field
        label={t("profit.costs.amount")}
        error={touched && amount === null ? t("common.required") : null}
      >
        <MoneyInput
          testID="crm-cost-amount"
          label={t("profit.costs.amount")}
          value={amount}
          onChange={setAmount}
        />
      </Field>
      <Segmented<SalonCost["category"]>
        value={category}
        onChange={setCategory}
        options={SALON_COST_CATEGORIES.map((id) => ({
          id,
          label: t(`profit.costs.category.${id}`),
        }))}
      />
      {cost ? null : (
        <Segmented<"r" | "o">
          value={recurring ? "r" : "o"}
          onChange={(v) => {
            setRecurring(v === "r");
          }}
          options={[
            { id: "r", label: t("profit.costs.recurring") },
            { id: "o", label: t("profit.costs.oneOff") },
          ]}
        />
      )}
      <Text size={12} color={c.muted}>
        {t("profit.costs.editHint")}
      </Text>
    </Sheet>
  );
}
