import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import {
  ADJUSTMENT_KIND_VALUES,
  type CommissionLines,
  type PayrollMonth,
  type PayrollRow,
} from "@gugu/contracts";
import { formatLocalDate, formatMonth, formatPercentPoints, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { salonDate } from "../../data/dates";
import {
  useAddAdjustment,
  useCommissionLines,
  useMarkPaid,
  usePayrollSettings,
  useRemoveAdjustment,
} from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { useCrmNav } from "../../shell/useCrmNav";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Input, Sheet } from "../../ui/form";
import { BigMoneyInput, BigNumber, BigSegmented, UndoBar, useUndo } from "./kit";
import { sortLines } from "./model";
import { baseDetail, DateField, SectionTitle, signedVnd, SkeletonRows } from "./parts";
import { Hint, paySummary } from "./PaySheet";

type Kind = (typeof ADJUSTMENT_KIND_VALUES)[number];
type Line = CommissionLines["items"][number];

/**
 * One person's month (owner review 2026-11-03): the amount to hand over big, how it adds up, the
 * pay setup with "edit", every service that earned commission with its date and a link to the
 * appointment, bonuses/deductions/advances (reason required; remove has undo), and "paid on".
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
  const { go } = useCrmNav();
  const today = salonDate(new Date(), summary?.timezone);
  const lines = useCommissionLines(row.staffId, month);
  const settings = usePayrollSettings();
  const add = useAddAdjustment();
  const remove = useRemoveAdjustment();
  const paid = useMarkPaid();
  const undo = useUndo();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>("bonus");
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [paidOn, setPaidOn] = useState(row.paidOn ?? today);
  const closed = payroll.status === "closed";
  const mine = payroll.adjustments.filter((a) => a.staffId === row.staffId);
  const vnd = (n: number) => formatVND(n, locale);
  const current = settings.data?.data?.staff.find((s) => s.staffId === row.staffId)?.current;
  const items = lines.data?.data?.items ?? [];
  const { earned, projected } = sortLines(items);

  const sumLines: [string, string, string | null][] = [
    [t("payroll.columns.base"), vnd(row.base), baseDetail(row, month, t)],
    [
      t("payroll.person.commissionEarned"),
      vnd(row.commission),
      t("payroll.services", { count: row.commissionLines }),
    ],
    ...(row.bonus
      ? ([[t("payroll.adjustments.kind.bonus"), signedVnd(row.bonus, locale), null]] as const)
      : []),
    ...(row.deduction
      ? ([
          [t("payroll.adjustments.kind.deduction"), signedVnd(-row.deduction, locale), null],
        ] as const)
      : []),
    ...(row.advance
      ? ([[t("payroll.adjustments.kind.advance"), signedVnd(-row.advance, locale), null]] as const)
      : []),
  ].map((x) => [x[0], x[1], x[2]]);

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
          setAdding(false);
        },
      },
    );
  };

  const openBooking = (l: Line) => {
    onClose();
    go(`/business/calendar?date=${l.date}&booking=${l.bookingId}`);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("payroll.detailTitle", { name: row.displayName, month: formatMonth(month, locale) })}
    >
      <ErrorBanner text={errorText(add.error ?? remove.error ?? paid.error)} />
      <UndoBar state={undo.state} onDismiss={undo.dismiss} />

      <View testID="crm-payroll-sum" style={{ gap: 10 }}>
        <BigNumber
          testID="crm-payroll-person-total"
          label={t("payroll.person.toPay")}
          value={vnd(row.total)}
          size={34}
          note={
            !closed && row.projectedCommission > 0
              ? t("payroll.person.projected", {
                  amount: vnd(row.projectedCommission),
                  count: projected.length,
                })
              : closed
                ? t("payroll.person.closed")
                : null
          }
        />
        <View
          style={{ gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line }}
        >
          {sumLines.map(([label, value, detail]) => (
            <View
              key={label}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Text size={15} color={c.body}>
                  {label}
                </Text>
                {detail ? (
                  <Text size={12} color={c.muted}>
                    {detail}
                  </Text>
                ) : null}
              </View>
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
            <Text role="uiSemiBold" size={16} color={c.ink}>
              {vnd(row.total)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text size={14} color={c.body}>
              {t("payroll.table.realCost")}
            </Text>
            <Text testID="crm-payroll-person-real" size={14} color={c.body}>
              {row.employerCostSet
                ? t("payroll.person.realCostSet", {
                    amount: vnd(row.realCost),
                    extra: vnd(row.employerCost),
                  })
                : t("payroll.person.realCostNotSet", { amount: vnd(row.realCost) })}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 14,
          borderRadius: 14,
          backgroundColor: c.accentSoft,
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
          <Text size={13} color={c.body}>
            {t("payroll.sheet.now")}
          </Text>
          <Text role="uiSemiBold" size={15} color={c.ink}>
            {paySummary(current ?? null, t, locale)}
          </Text>
        </View>
        {canManage ? (
          <CalmButton
            testID="crm-payroll-person-pay"
            variant="secondary"
            icon="wallet"
            label={t("payroll.person.editPay")}
            onPress={onSetPay}
          />
        ) : null}
      </View>

      <View testID="crm-payroll-lines" style={{ gap: 6 }}>
        <SectionTitle text={t("payroll.person.linesTitle")} />
        {lines.isPending ? (
          <SkeletonRows rows={3} />
        ) : items.length === 0 ? (
          <Text size={14} color={c.muted}>
            {t("payroll.lines.empty")}
          </Text>
        ) : (
          <>
            <LineGroup
              title={t("payroll.person.earnedTitle", {
                count: earned.length,
                amount: vnd(earned.reduce((n, l) => n + l.amount, 0)),
              })}
              lines={earned}
              onOpen={openBooking}
            />
            {projected.length && !closed ? (
              <LineGroup
                title={t("payroll.person.projectedTitle", {
                  count: projected.length,
                  amount: vnd(projected.reduce((n, l) => n + l.amount, 0)),
                })}
                lines={projected}
                onOpen={openBooking}
                muted
              />
            ) : null}
          </>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle text={t("payroll.adjustments.title")} />
        {mine.length === 0 ? (
          <Text size={14} color={c.muted}>
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
                minHeight: 52,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Pill
                size={12}
                tone={a.kind === "bonus" ? "up" : "down"}
                label={t(`payroll.adjustments.kind.${a.kind}`)}
              />
              <Text size={15} color={c.ink} style={{ flex: 1 }} numberOfLines={2}>
                {a.reason}
              </Text>
              <Text role="uiSemiBold" size={15} color={c.ink}>
                {signedVnd(a.kind === "bonus" ? a.amount : -a.amount, locale)}
              </Text>
              {canManage && !closed ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("payroll.adjustments.remove")}
                  onPress={() => {
                    remove.mutate(a.id, {
                      onSuccess: () => {
                        undo.show(t("payroll.undo.adjustmentRemoved"), () => {
                          add.mutate({
                            month,
                            staffId: row.staffId,
                            kind: a.kind,
                            amount: a.amount,
                            reason: a.reason,
                          });
                        });
                      },
                    });
                  }}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="trash" size={18} color={c.body} />
                </Pressable>
              ) : null}
            </View>
          ))
        )}
        {canManage && closed ? (
          <Text size={13} color={c.muted}>
            {t("payroll.adjustments.lockedHint")}
          </Text>
        ) : null}
        {canManage && !closed && !adding ? (
          <View style={{ alignSelf: "flex-start" }}>
            <CalmButton
              testID="crm-adjust-open"
              variant="secondary"
              icon="plus"
              label={t("payroll.person.addAdjustment")}
              onPress={() => {
                setAdding(true);
              }}
            />
          </View>
        ) : null}
        {canManage && !closed && adding ? (
          <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.surfaceMuted }}>
            <BigSegmented<Kind>
              testID="crm-adjust-kind"
              label={t("payroll.adjustments.title")}
              value={kind}
              onChange={setKind}
              options={ADJUSTMENT_KIND_VALUES.map((id) => ({
                id,
                label: t(`payroll.adjustments.kind.${id}`),
              }))}
            />
            <Text role="uiMedium" size={15} color={c.ink}>
              {t("payroll.adjustments.amount")}
            </Text>
            <BigMoneyInput
              testID="crm-adjust-amount"
              size="md"
              label={t("payroll.adjustments.amount")}
              value={amount}
              onChange={setAmount}
              invalid={touched && !amount}
            />
            {touched && !amount ? <Hint error={t("payroll.validation.amountRequired")} /> : null}
            <Text role="uiMedium" size={15} color={c.ink}>
              {t("payroll.adjustments.reason")}
            </Text>
            <Input
              testID="crm-adjust-reason"
              label={t("payroll.adjustments.reason")}
              placeholder={t("payroll.person.reasonPlaceholder")}
              value={reason}
              invalid={touched && !reason.trim()}
              onChangeText={setReason}
            />
            <Hint
              error={touched && !reason.trim() ? t("payroll.validation.reasonRequired") : null}
              text={t("payroll.adjustments.reasonHint")}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <CalmButton
                testID="crm-adjust-add"
                icon="plus"
                label={t("payroll.adjustments.add")}
                onPress={submit}
              />
              <CalmButton
                variant="ghost"
                label={t("common.cancel")}
                onPress={() => {
                  setAdding(false);
                  setTouched(false);
                }}
              />
            </View>
          </View>
        ) : null}
      </View>

      {canManage ? (
        <View style={{ gap: 8 }}>
          <SectionTitle text={t("payroll.person.paidTitle")} />
          {!closed ? (
            <Text size={14} color={c.muted}>
              {t("payroll.paidNeedsClose")}
            </Text>
          ) : row.paidOn ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Pill
                tone="up"
                label={t("payroll.paidOn", { date: formatLocalDate(row.paidOn, locale) })}
              />
              <CalmButton
                variant="ghost"
                label={t("payroll.unmarkPaid")}
                onPress={() => {
                  const was = row.paidOn;
                  paid.mutate(
                    { month, staffId: row.staffId, paidOn: null },
                    {
                      onSuccess: () => {
                        undo.show(t("payroll.undo.unpaid"), () => {
                          paid.mutate({ month, staffId: row.staffId, paidOn: was });
                        });
                      },
                    },
                  );
                }}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text size={14} color={c.body}>
                {t("payroll.paidDate")}
              </Text>
              <DateField value={paidOn} onChange={setPaidOn} today={today} />
              <Text size={13} color={c.muted}>
                {t("payroll.paidHint")}
              </Text>
              <View style={{ alignSelf: "flex-start" }}>
                <CalmButton
                  testID="crm-payroll-mark-paid"
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

/** "Đã làm · 5 dịch vụ · 199.500đ": date, service, price × rate = commission, link to booking. */
function LineGroup({
  title,
  lines,
  onOpen,
  muted,
}: {
  title: string;
  lines: Line[];
  onOpen: (l: Line) => void;
  muted?: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const vnd = (n: number) => formatVND(n, locale);
  const [all, setAll] = useState(false);
  if (!lines.length) return null;
  const shown = all ? lines : lines.slice(0, VISIBLE_LINES);
  return (
    <View style={{ gap: 2 }}>
      <Text role="uiSemiBold" size={14} color={muted ? c.body : c.ink} style={{ paddingTop: 6 }}>
        {title}
      </Text>
      {shown.map((l) => (
        <Pressable
          key={l.lineId}
          testID={`crm-payroll-line-${l.lineId}`}
          accessibilityRole="link"
          accessibilityLabel={t("payroll.person.openBooking", {
            service: (locale === "en" && l.service.en) || l.service.vi,
            date: formatLocalDate(l.date, locale),
          })}
          onPress={() => {
            onOpen(l);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            minHeight: 56,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderColor: c.line,
          }}
        >
          <Text size={13} color={c.muted} style={{ width: 82 }}>
            {formatLocalDate(l.date, locale)}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text size={15} color={c.ink} numberOfLines={1}>
              {(locale === "en" && l.service.en) || l.service.vi}
            </Text>
            <Text size={12} color={c.muted}>
              {l.rate === null
                ? t("payroll.lines.noRate")
                : l.rate.kind === "fixed"
                  ? t("payroll.lines.rateFixed", { amount: vnd(l.rate.amount ?? 0) })
                  : t("payroll.person.ratePercent", {
                      percent: formatPercentPoints(l.rate.percent ?? 0, locale),
                      base: vnd(l.base),
                    })}
            </Text>
          </View>
          <Text role="uiSemiBold" size={15} color={muted ? c.body : c.ink}>
            {muted ? `+${vnd(l.amount)}` : vnd(l.amount)}
          </Text>
          <Icon name="chevronRight" size={16} color={c.muted} />
        </Pressable>
      ))}
      {lines.length > VISIBLE_LINES ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: all }}
          onPress={() => {
            setAll((v) => !v);
          }}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Icon name={all ? "chevronUp" : "chevronDown"} size={16} color={c.accent} />
          <Text role="uiSemiBold" size={14} color={c.accent}>
            {all
              ? t("payroll.person.showLess")
              : t("payroll.person.showMore", { count: lines.length - VISIBLE_LINES })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const VISIBLE_LINES = 6;
