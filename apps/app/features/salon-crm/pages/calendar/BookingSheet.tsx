import { useState, type ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type { BookingStatusValue, SalonBooking, StaffMember } from "@gugu/contracts";
import { formatDateLong, formatTime, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import {
  bookingStatusUi,
  serviceLabel,
  useOfflineSale,
  useRecordSale,
  useTransition,
} from "../../data/bookings";
import { useSalon } from "../../data/SalonContext";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, MoneyInput, Segmented, Sheet } from "../../ui/form";
import { RescheduleSlots } from "./SlotPicker";

type Mode = "view" | "cancel" | "reschedule" | "sale" | "correct";
type CancelReason = "customer" | "unreachable" | "salon" | "other";
type Method = "cash" | "bank_transfer" | "ewallet" | "card" | "other";

const PILL_TONE: Record<BookingStatusValue, "accent" | "brand" | "neutral" | "down"> = {
  pending: "brand",
  confirmed: "accent",
  checked_in: "accent",
  completed: "neutral",
  no_show: "down",
  cancelled_by_customer: "neutral",
  cancelled_by_salon: "neutral",
};

/**
 * Appointment detail (07 M7.2): client, service, staff, estimate (pay at the salon), and the
 * actions the engine allows for the status — check in, complete (+ optional amount received),
 * no-show, cancel with reason, reschedule. The server enforces time windows; errors are shown.
 */
export function BookingSheet({
  booking,
  staff,
  tz,
  onClose,
}: {
  booking: SalonBooking;
  staff: Pick<StaffMember, "id" | "displayName">[];
  tz: string;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const { can } = useSalon();
  const [mode, setMode] = useState<Mode>("view");
  const [reason, setReason] = useState<CancelReason>("customer");
  const [reasonText, setReasonText] = useState("");
  const [amount, setAmount] = useState<number | null>(booking.totalPriceMinor);
  const [method, setMethod] = useState<Method>("cash");
  const transition = useTransition();
  const sale = useOfflineSale(booking.status === "completed" ? booking.id : null);
  const recordSale = useRecordSale();
  const canWrite = can("bookings.write");
  const busy = transition.isPending || recordSale.isPending;
  const start = new Date(booking.startsAt);
  const who = staff.find((s) => s.id === booking.staffId)?.displayName ?? "";
  const status = bookingStatusUi(booking.status);
  const price =
    booking.totalPriceMaxMinor !== null && booking.totalPriceMaxMinor > booking.totalPriceMinor
      ? `${formatVND(booking.totalPriceMinor, locale)} – ${formatVND(booking.totalPriceMaxMinor, locale)}`
      : formatVND(booking.totalPriceMinor, locale);

  const go = (to: BookingStatusValue, why?: string, after?: () => void) => {
    transition.mutate(
      { id: booking.id, body: { to, ...(why ? { reason: why } : {}) } },
      { onSuccess: after ?? onClose },
    );
  };

  const cancel = () => {
    const text = reasonText.trim() || t(`booking.reasons.${reason}`);
    go(reason === "customer" ? "cancelled_by_customer" : "cancelled_by_salon", text);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("booking.title", { code: booking.referenceCode })}
      footer={<Actions />}
    >
      <ErrorBanner text={errorText(transition.error ?? recordSale.error)} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pill tone={PILL_TONE[booking.status]} label={t(`booking.status.${booking.status}`)} />
        <Pill label={t(`booking.source.${booking.source}`, { defaultValue: booking.source })} />
        {booking.lateCancellation ? <Pill tone="down" label={t("booking.lateCancel")} /> : null}
      </View>
      <View style={{ gap: 4 }}>
        <Text role="uiSemiBold" size={20} color={c.ink}>
          {`${formatTime(start, locale, tz)} – ${formatTime(new Date(booking.endsAt), locale, tz)}`}
        </Text>
        <Text size={14} color={c.body} style={{ textTransform: "capitalize" }}>
          {formatDateLong(start, locale, tz)}
        </Text>
      </View>
      <Row icon="users" label={t("booking.client")}>
        {booking.customer ? (
          <View style={{ gap: 2 }}>
            <Text role="uiSemiBold" size={15} color={c.ink}>
              {booking.customer.name}
            </Text>
            {booking.customer.phone ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL(`tel:${booking.customer?.phone ?? ""}`);
                }}
              >
                <Text size={14} color={c.accent}>
                  {booking.customer.phone}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text size={15} color={c.ink}>
            {t("booking.walkIn")}
          </Text>
        )}
      </Row>
      <Row icon="tag" label={t("booking.service")}>
        <View style={{ gap: 2 }}>
          <Text role="uiSemiBold" size={15} color={c.ink}>
            {serviceLabel(booking, locale)}
          </Text>
          {booking.service.addOns.map((a) => (
            <Text key={a.addOnId} size={13} color={c.body}>
              {`+ ${(locale === "en" && a.name.en) || a.name.vi}`}
            </Text>
          ))}
        </View>
      </Row>
      <Row icon="team" label={t("booking.staff")}>
        <Text size={15} color={c.ink}>
          {who}
        </Text>
      </Row>
      <Row icon="chart" label={t("booking.estimate")}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Text role="uiSemiBold" size={15} color={c.ink}>
            {price}
          </Text>
          <Pill tone="accent" size={11} label={t("revenueKind.estimated")} />
          <Text size={12} color={c.muted}>
            {t("booking.payAtSalon")}
          </Text>
        </View>
      </Row>
      {booking.note ? (
        <Row icon="clipboard" label={t("booking.note")}>
          <Text size={14} color={c.ink}>
            {booking.note}
          </Text>
        </Row>
      ) : null}
      {sale.data ? (
        <Row icon="check" label={t("booking.amountReceived")}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Text role="uiSemiBold" size={15} color={c.ink}>
              {formatVND(sale.data.amount, locale)}
            </Text>
            <Pill size={11} label={t("revenueKind.offline")} />
            <Text size={12} color={c.muted}>
              {t(`booking.methods.${sale.data.method}`)}
            </Text>
          </View>
        </Row>
      ) : null}

      {mode === "cancel" ? (
        <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.surfaceMuted }}>
          <Text role="uiSemiBold" size={14} color={c.ink}>
            {t("booking.cancelTitle")}
          </Text>
          <Segmented<CancelReason>
            value={reason}
            onChange={setReason}
            options={(["customer", "unreachable", "salon", "other"] as const).map((r) => ({
              id: r,
              label: t(`booking.reasons.${r}`),
            }))}
          />
          <Input
            label={t("booking.reasonText")}
            placeholder={t("booking.reasonPlaceholder")}
            value={reasonText}
            onChangeText={setReasonText}
          />
          <Text size={12} color={c.muted}>
            {t("booking.cancelNotice")}
          </Text>
        </View>
      ) : null}
      {mode === "correct" ? (
        <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.surfaceMuted }}>
          <Field label={t("booking.correctReason")}>
            <Input
              label={t("booking.correctReason")}
              value={reasonText}
              onChangeText={setReasonText}
            />
          </Field>
        </View>
      ) : null}
      {mode === "reschedule" ? (
        <RescheduleSlots booking={booking} tz={tz} staff={staff} onPicked={onClose} />
      ) : null}
      {mode === "sale" ? (
        <View
          testID="crm-sale-form"
          style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.surfaceMuted }}
        >
          <Text role="uiSemiBold" size={14} color={c.ink}>
            {t("booking.amountTitle")}
          </Text>
          <Text size={12} color={c.muted}>
            {t("booking.amountHint")}
          </Text>
          <MoneyInput
            testID="crm-sale-amount"
            label={t("booking.amountReceived")}
            value={amount}
            onChange={setAmount}
          />
          <Segmented<Method>
            value={method}
            onChange={setMethod}
            options={(["cash", "bank_transfer", "ewallet", "card", "other"] as const).map((m) => ({
              id: m,
              label: t(`booking.methods.${m}`),
            }))}
          />
        </View>
      ) : null}
    </Sheet>
  );

  function Actions() {
    if (!canWrite && booking.status !== "confirmed" && booking.status !== "checked_in") {
      return <CalmButton variant="secondary" label={t("common.close")} onPress={onClose} />;
    }
    if (mode === "cancel") {
      return (
        <>
          <CalmButton
            variant="secondary"
            label={t("common.back")}
            onPress={() => {
              setMode("view");
            }}
          />
          <CalmButton
            testID="crm-cancel-confirm"
            label={busy ? t("common.saving") : t("booking.cancelConfirm")}
            onPress={cancel}
          />
        </>
      );
    }
    if (mode === "correct") {
      const to = booking.status === "completed" ? "no_show" : "completed";
      return (
        <>
          <CalmButton
            variant="secondary"
            label={t("common.back")}
            onPress={() => {
              setMode("view");
            }}
          />
          <CalmButton
            label={t(to === "no_show" ? "booking.markNoShow" : "booking.markCompleted")}
            onPress={() => {
              if (reasonText.trim().length >= 3) go(to, reasonText.trim());
            }}
          />
        </>
      );
    }
    if (mode === "reschedule") {
      return (
        <CalmButton
          variant="secondary"
          label={t("common.back")}
          onPress={() => {
            setMode("view");
          }}
        />
      );
    }
    if (mode === "sale") {
      return (
        <>
          <CalmButton variant="secondary" label={t("booking.skip")} onPress={onClose} />
          <CalmButton
            testID="crm-sale-save"
            label={busy ? t("common.saving") : t("common.save")}
            onPress={() => {
              if (amount === null) return;
              recordSale.mutate(
                { id: booking.id, body: { amount, method } },
                { onSuccess: onClose },
              );
            }}
          />
        </>
      );
    }
    const s = booking.status;
    return (
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          flex: 1,
        }}
      >
        {s === "pending" || s === "confirmed" || s === "checked_in" ? (
          <CalmButton
            variant="ghost"
            label={t("booking.cancel")}
            onPress={() => {
              setMode("cancel");
            }}
          />
        ) : null}
        {s === "pending" || s === "confirmed" ? (
          <CalmButton
            testID="crm-reschedule"
            variant="secondary"
            icon="calendar"
            label={t("booking.reschedule")}
            onPress={() => {
              setMode("reschedule");
            }}
          />
        ) : null}
        {s === "confirmed" ? (
          <CalmButton
            variant="secondary"
            label={t("booking.noShow")}
            onPress={() => {
              go("no_show");
            }}
          />
        ) : null}
        {s === "pending" ? (
          <CalmButton
            label={t("booking.confirm")}
            onPress={() => {
              go("confirmed");
            }}
          />
        ) : null}
        {s === "confirmed" ? (
          <CalmButton
            testID="crm-check-in"
            variant="secondary"
            icon="check"
            label={t("booking.checkIn")}
            onPress={() => {
              go("checked_in");
            }}
          />
        ) : null}
        {s === "confirmed" || s === "checked_in" ? (
          <CalmButton
            testID="crm-complete"
            label={busy ? t("common.saving") : t("booking.complete")}
            onPress={() => {
              go("completed", undefined, () => {
                if (canWrite) setMode("sale");
                else onClose();
              });
            }}
          />
        ) : null}
        {s === "completed" && canWrite ? (
          <>
            <CalmButton
              variant="ghost"
              label={t("booking.markNoShow")}
              onPress={() => {
                setReasonText("");
                setMode("correct");
              }}
            />
            <CalmButton
              label={sale.data ? t("booking.editAmount") : t("booking.addAmount")}
              onPress={() => {
                setMode("sale");
              }}
            />
          </>
        ) : null}
        {s === "no_show" && canWrite ? (
          <CalmButton
            label={t("booking.markCompleted")}
            onPress={() => {
              setReasonText("");
              setMode("correct");
            }}
          />
        ) : null}
        {status === null ? (
          <CalmButton variant="secondary" label={t("common.close")} onPress={onClose} />
        ) : null}
      </View>
    );
  }
}

function Row({
  icon,
  label,
  children,
}: {
  icon: "users" | "tag" | "team" | "chart" | "clipboard" | "check";
  label: string;
  children: ReactNode;
}) {
  const { c } = useCalm();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: c.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={16} color={c.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text size={12} color={c.muted}>
          {label}
        </Text>
        {children}
      </View>
    </View>
  );
}
