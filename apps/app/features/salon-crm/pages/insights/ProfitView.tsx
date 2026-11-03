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
import {
  MonthSwitcher,
  Note,
  RetryError,
  SectionTitle,
  signedVnd,
  SkeletonRows,
} from "../payroll/parts";

/** The four headline tiles (≤ 4 per view, skill UX rule 7); keys from the metric catalogue. */
export const PROFIT_HEADLINE = [
  "profit.revenue_earned",
  "profit.revenue_upcoming",
  "profit.net",
  "profit.net_margin",
] as const;

const KIND_LABEL = {
  estimated_from_bookings: "revenueKind.estimated",
  recorded_offline_sale: "revenueKind.offline",
  reported_by_salon: "revenueKind.reported",
} as const;

const keyOf = (k: string) => k.replace(/\./g, "_");

/**
 * Owner "This month" (ADR-0016): progress through the month, 4 headline numbers with their
 * registry definition, and a plain table "so far / projected / month" ending in the estimated net
 * profit. Other monthly costs are edited right here.
 */
export function ProfitView() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
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
            <Text size={13} color={c.body}>
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
          <Text role="uiSemiBold" size={20} color={c.ink}>
            {t("profit.title", { month: formatMonth(month, locale) })}
          </Text>
          <View
            testID="crm-profit-tiles"
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
          >
            {PROFIT_HEADLINE.map((k) => (
              <ProfitTile key={k} id={k} p={p} />
            ))}
          </View>
          <Breakdown p={p} />
          <CostsCard month={month} costs={p.costs} total={p.breakdown.otherCosts} />
          <Note text={t("profit.note")} />
        </>
      )}
    </View>
  );
}

function ProfitTile({ id, p }: { id: (typeof PROFIT_HEADLINE)[number]; p: Profit }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [info, setInfo] = useState(false);
  const m = p.metrics[id];
  if (!m) return null;
  const value =
    m.value === null
      ? "—"
      : m.unit === "vnd"
        ? formatVND(m.value, locale)
        : formatPercent(m.value, locale);
  return (
    <CalmCard testID={`crm-profit-tile-${id}`} style={{ gap: 6, flexBasis: 210, flexGrow: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text size={13} color={c.muted}>
          {t(`insights.metrics.${keyOf(id)}`, { defaultValue: id })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("profit.definition")}
          onPress={() => {
            setInfo((v) => !v);
          }}
          style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="info" size={16} color={c.muted} />
        </Pressable>
      </View>
      <Text
        testID={`crm-profit-value-${id}`}
        role="uiSemiBold"
        size={24}
        color={m.value !== null && m.value < 0 ? c.attention : c.ink}
      >
        {value}
      </Text>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Pill
          size={10}
          tone={m.basis === "actual" ? "up" : "neutral"}
          label={t(
            m.basis === "actual"
              ? "profit.cols.actual"
              : m.basis === "projected"
                ? "profit.cols.projected"
                : "profit.cols.total",
          )}
        />
        {m.revenueKind ? (
          <Pill size={10} tone="accent" label={t(KIND_LABEL[m.revenueKind])} />
        ) : null}
      </View>
      {info ? (
        <Text size={12} color={c.body}>
          {t(`insights.definitions.${keyOf(id)}`, { defaultValue: "" })}
        </Text>
      ) : null}
    </CalmCard>
  );
}

function Breakdown({ p }: { p: Profit }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const b = p.breakdown;
  const vnd = (n: number | null) => (n === null ? "" : formatVND(n, locale));
  const neg = (n: number) => signedVnd(-n, locale);
  const rows: {
    id: string;
    label: string;
    actual: string;
    projected: string;
    total: string;
    strong?: boolean;
    hint?: string;
  }[] = [
    {
      id: "revenue",
      label: t("profit.rows.revenue"),
      actual: vnd(b.revenueEarned),
      projected: vnd(b.revenueUpcoming),
      total: vnd(b.revenueEarned + b.revenueUpcoming),
      ...(b.revenueEarnedRecorded > 0
        ? { hint: t("profit.recordedPart", { amount: vnd(b.revenueEarnedRecorded) }) }
        : {}),
    },
    ...(b.noShowAllowance > 0
      ? [
          {
            id: "noShow",
            label: t("profit.rows.noShow"),
            actual: "",
            projected: neg(b.noShowAllowance),
            total: neg(b.noShowAllowance),
            hint: t("profit.assumption", { rate: formatPercent(p.noShow.rate ?? 0, locale) }),
          },
        ]
      : []),
    {
      id: "serviceCosts",
      label: t("profit.rows.serviceCosts"),
      actual: neg(b.serviceCostsActual),
      projected: neg(b.serviceCostsProjected),
      total: neg(b.serviceCosts),
      ...(p.servicesWithoutCost > 0
        ? { hint: t("profit.missingCost", { count: p.servicesWithoutCost }) }
        : {}),
    },
    {
      id: "gross",
      label: t("profit.rows.gross"),
      actual: "",
      projected: "",
      total: vnd(b.grossProfit),
      strong: true,
      ...(b.grossMargin !== null
        ? {
            hint: `${t("insights.metrics.profit_gross_margin")}: ${formatPercent(b.grossMargin, locale)}`,
          }
        : {}),
    },
    {
      id: "commission",
      label: t("profit.rows.commission"),
      actual: neg(b.commissionEarned),
      projected: neg(b.commissionProjected),
      total: neg(b.commissionEarned + b.commissionProjected),
    },
    {
      id: "basePay",
      label: t("profit.rows.basePay"),
      actual: "",
      projected: "",
      total: neg(b.basePay),
      ...(p.payrollClosed ? { hint: t("profit.closedPayroll") } : {}),
    },
    ...(b.adjustments !== 0
      ? [
          {
            id: "adjustments",
            label: t("profit.rows.adjustments"),
            actual: "",
            projected: "",
            total: signedVnd(-b.adjustments, locale),
          },
        ]
      : []),
    {
      id: "otherCosts",
      label: t("profit.rows.otherCosts"),
      actual: "",
      projected: "",
      total: neg(b.otherCosts),
    },
  ];
  const cols = [t("profit.cols.actual"), t("profit.cols.projected"), t("profit.cols.total")];
  return (
    <CalmCard testID="crm-profit-breakdown" style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", gap: 8, paddingBottom: 6 }}>
        <View style={{ flex: 2 }} />
        {cols.map((h) => (
          <Text key={h} size={12} color={c.muted} style={{ flex: 1, textAlign: "right" }}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View
          key={r.id}
          testID={`crm-profit-row-${r.id}`}
          style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: c.line, gap: 2 }}
        >
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text role={r.strong ? "uiSemiBold" : "ui"} size={14} color={c.ink} style={{ flex: 2 }}>
              {r.label}
            </Text>
            {[r.actual, r.projected, r.total].map((v, i) => (
              <Text
                key={i}
                role={i === 2 || r.strong ? "uiSemiBold" : "ui"}
                size={14}
                color={i === 1 ? c.muted : c.ink}
                style={{ flex: 1, textAlign: "right" }}
              >
                {v}
              </Text>
            ))}
          </View>
          {r.hint ? (
            <Text size={12} color={c.muted}>
              {r.hint}
            </Text>
          ) : null}
        </View>
      ))}
      <View
        testID="crm-profit-net"
        style={{
          flexDirection: "row",
          gap: 8,
          paddingTop: 12,
          borderTopWidth: 2,
          borderColor: c.line,
          alignItems: "center",
        }}
      >
        <Text role="uiSemiBold" size={16} color={c.ink} style={{ flex: 2 }}>
          {t("profit.rows.net")}
        </Text>
        <Text
          role="uiSemiBold"
          size={20}
          color={b.netProfit < 0 ? c.attention : c.ink}
          style={{ flex: 3, textAlign: "right" }}
        >
          {`${formatVND(b.netProfit, locale)}${b.netMargin !== null ? ` · ${formatPercent(b.netMargin, locale)}` : ""}`}
        </Text>
      </View>
      {b.noShowAllowance === 0 && b.revenueUpcoming > 0 ? (
        <Text size={12} color={c.muted}>
          {t("profit.noAssumption")}
        </Text>
      ) : null}
    </CalmCard>
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
