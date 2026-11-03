import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Pill, Text, useCalm } from "@gugu/design-system";
import { ADJUSTMENT_KIND_VALUES, type PayrollMonth, type PayrollRow } from "@gugu/contracts";
import { formatLocalDate, formatMonth, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { salonDate } from "../../data/dates";
import {
  useAddAdjustment,
  useCommissionLines,
  useMarkPaid,
  useRemoveAdjustment,
} from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, MoneyInput, Segmented, Sheet } from "../../ui/form";
import { DateField, SectionTitle, signedVnd, SkeletonRows } from "./parts";

type Kind = (typeof ADJUSTMENT_KIND_VALUES)[number];

/**
 * One person's month: the sum (base + commission ± adjustments = to pay), commission per service,
 * bonuses/deductions/advances with a required reason, and the "paid on" note once closed.
 */
export function StaffPayrollSheet({
  month,
  row,
  payroll,
  canManage,
  onSetPay,
  onClose,
}: {
  month: string;
  row: PayrollRow;
  payroll: PayrollMonth;
  canManage: boolean;
  onSetPay: () => void;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const { summary } = useSalon();
  const today = salonDate(new Date(), summary?.timezone);
  const lines = useCommissionLines(row.staffId, month);
  const add = useAddAdjustment();
  const remove = useRemoveAdjustment();
  const paid = useMarkPaid();
  const [kind, setKind] = useState<Kind>("bonus");
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [paidOn, setPaidOn] = useState(row.paidOn ?? today);
  const closed = payroll.status === "closed";
  const mine = payroll.adjustments.filter((a) => a.staffId === row.staffId);
  const vnd = (n: number) => formatVND(n, locale);

  const sum: [string, string][] = [
    [t("payroll.columns.base"), vnd(row.base)],
    [t("payroll.columns.commission"), vnd(row.commission)],
    ...(row.bonus
      ? ([[t("payroll.adjustments.kind.bonus"), signedVnd(row.bonus, locale)]] as [
          string,
          string,
        ][])
      : []),
    ...(row.deduction
      ? ([[t("payroll.adjustments.kind.deduction"), signedVnd(-row.deduction, locale)]] as [
          string,
          string,
        ][])
      : []),
    ...(row.advance
      ? ([[t("payroll.adjustments.kind.advance"), signedVnd(-row.advance, locale)]] as [
          string,
          string,
        ][])
      : []),
  ];

  const submit = () => {
    setTouched(true);
    if (!amount || !reason.trim()) return;
    add.mutate(
      { month, staffId: row.staffId, kind, amount, reason: reason.trim() },
      {
        onSuccess: () => {
          setAmount(null);
          setReason("");
          setTouched(false);
        },
      },
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("payroll.detailTitle", { name: row.displayName, month: formatMonth(month, locale) })}
    >
      <ErrorBanner text={errorText(add.error ?? remove.error ?? paid.error)} />
      <View testID="crm-payroll-sum" style={{ gap: 6 }}>
        {sum.map(([label, value]) => (
          <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text size={15} color={c.body}>
              {label}
            </Text>
            <Text size={15} color={c.ink}>
              {value}
            </Text>
          </View>
        ))}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderColor: c.line,
            paddingTop: 8,
          }}
        >
          <Text role="uiSemiBold" size={16} color={c.ink}>
            {t("payroll.columns.total")}
          </Text>
          <Text role="uiSemiBold" size={18} color={c.ink}>
            {vnd(row.total)}
          </Text>
        </View>
        {row.projectedCommission > 0 ? (
          <Text size={12} color={c.muted}>
            {t("payroll.projected", { amount: vnd(row.projectedCommission) })}
          </Text>
        ) : null}
      </View>
      {canManage ? (
        <View style={{ alignSelf: "flex-start" }}>
          <CalmButton
            size="sm"
            variant="secondary"
            icon="wallet"
            label={t("payroll.setPay")}
            onPress={onSetPay}
          />
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionTitle text={t("payroll.lines.title")} />
        {lines.isPending ? (
          <SkeletonRows rows={2} />
        ) : !lines.data?.data?.items.length ? (
          <Text size={13} color={c.muted}>
            {t("payroll.lines.empty")}
          </Text>
        ) : (
          lines.data.data.items.map((l) => (
            <View
              key={l.lineId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 8,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Text size={13} color={c.muted} style={{ width: 86 }}>
                {formatLocalDate(l.date, locale)}
              </Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text size={14} color={c.ink} numberOfLines={1}>
                  {(locale === "en" && l.service.en) || l.service.vi}
                </Text>
                <Text size={12} color={c.muted}>
                  {l.rate === null
                    ? t("payroll.lines.noRate")
                    : l.rate.kind === "fixed"
                      ? t("payroll.lines.rateFixed", { amount: vnd(l.rate.amount ?? 0) })
                      : t("payroll.lines.ratePercent", {
                          percent: l.rate.percent ?? 0,
                          base: vnd(l.base),
                        })}
                </Text>
              </View>
              <Pill
                size={10}
                tone={l.state === "earned" ? "up" : "neutral"}
                label={t(`payroll.lines.${l.state}`)}
              />
              <Text
                role="uiSemiBold"
                size={14}
                color={c.ink}
                style={{ minWidth: 84, textAlign: "right" }}
              >
                {vnd(l.amount)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle text={t("payroll.adjustments.title")} />
        {mine.length === 0 ? (
          <Text size={13} color={c.muted}>
            {t("payroll.adjustments.empty")}
          </Text>
        ) : (
          mine.map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 8,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Pill
                size={10}
                tone={a.kind === "bonus" ? "up" : "down"}
                label={t(`payroll.adjustments.kind.${a.kind}`)}
              />
              <Text size={14} color={c.ink} style={{ flex: 1 }} numberOfLines={2}>
                {a.reason}
              </Text>
              <Text role="uiSemiBold" size={14} color={c.ink}>
                {signedVnd(a.kind === "bonus" ? a.amount : -a.amount, locale)}
              </Text>
              {canManage && !closed ? (
                <CalmButton
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  label={t("payroll.adjustments.remove")}
                  onPress={() => {
                    remove.mutate(a.id);
                  }}
                />
              ) : null}
            </View>
          ))
        )}
        {canManage && closed ? (
          <Text size={12} color={c.muted}>
            {t("payroll.adjustments.lockedHint")}
          </Text>
        ) : null}
        {canManage && !closed ? (
          <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.surfaceMuted }}>
            <Segmented<Kind>
              value={kind}
              onChange={setKind}
              options={ADJUSTMENT_KIND_VALUES.map((id) => ({
                id,
                label: t(`payroll.adjustments.kind.${id}`),
              }))}
            />
            <Field
              label={t("payroll.adjustments.amount")}
              error={touched && !amount ? t("common.required") : null}
            >
              <MoneyInput
                testID="crm-adjust-amount"
                label={t("payroll.adjustments.amount")}
                value={amount}
                onChange={setAmount}
              />
            </Field>
            <Field
              label={t("payroll.adjustments.reason")}
              hint={t("payroll.adjustments.reasonHint")}
              error={touched && !reason.trim() ? t("common.required") : null}
            >
              <Input
                testID="crm-adjust-reason"
                label={t("payroll.adjustments.reason")}
                value={reason}
                onChangeText={setReason}
              />
            </Field>
            <View style={{ alignSelf: "flex-start" }}>
              <CalmButton
                testID="crm-adjust-add"
                size="sm"
                icon="plus"
                label={t("payroll.adjustments.add")}
                onPress={submit}
              />
            </View>
          </View>
        ) : null}
      </View>

      {canManage ? (
        <View style={{ gap: 8 }}>
          <SectionTitle text={t("payroll.columns.paid")} />
          {!closed ? (
            <Text size={13} color={c.muted}>
              {t("payroll.paidNeedsClose")}
            </Text>
          ) : row.paidOn ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pill
                tone="up"
                label={t("payroll.paidOn", { date: formatLocalDate(row.paidOn, locale) })}
              />
              <CalmButton
                size="sm"
                variant="ghost"
                label={t("payroll.unmarkPaid")}
                onPress={() => {
                  paid.mutate({ month, staffId: row.staffId, paidOn: null });
                }}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Field label={t("payroll.paidDate")} hint={t("payroll.paidHint")}>
                <DateField value={paidOn} onChange={setPaidOn} today={today} />
              </Field>
              <View style={{ alignSelf: "flex-start" }}>
                <CalmButton
                  testID="crm-payroll-mark-paid"
                  size="sm"
                  icon="check"
                  label={t("payroll.markPaid")}
                  onPress={() => {
                    paid.mutate({ month, staffId: row.staffId, paidOn });
                  }}
                />
              </View>
            </View>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}
