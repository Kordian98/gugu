import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Text, useCalm } from "@gugu/design-system";
import type { BookingSettings, SalonSettings } from "@gugu/contracts";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useErrorText } from "../../ui/errors";
import {
  ErrorBanner,
  Field,
  Input,
  NumberInput,
  Segmented,
  SettingRow,
  Toggle,
} from "../../ui/form";

const HOURS = 60;

/**
 * Booking & confirmation (q13: auto or manual with a 12 h window; q66: confirm new/unverified
 * clients, off by default; q18: hide staff choice) and cut-offs. Read by the booking engine (06).
 */
export function BookingSection({
  settings,
  canEdit,
}: {
  settings: SalonSettings;
  canEdit: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [b, setB] = useState<BookingSettings>(settings.booking);
  const [saved, setSaved] = useState(false);
  const save = useCrmMutation(crmApi.updateBooking, ["settings"]);
  const set = (p: Partial<BookingSettings>) => {
    setB((x) => ({ ...x, ...p }));
  };
  return (
    <CalmCard style={{ gap: 8 }}>
      <Text role="uiSemiBold" size={16} color={c.ink}>
        {t("settings.booking")}
      </Text>
      <ErrorBanner text={errorText(save.error)} />
      <Field label={t("settings.confirmation")}>
        <Segmented<"auto" | "manual">
          value={b.confirmationMode}
          onChange={(v) => {
            set({ confirmationMode: v });
          }}
          options={[
            { id: "auto", label: t("settings.confirmAuto") },
            { id: "manual", label: t("settings.confirmManual") },
          ]}
        />
      </Field>
      <Text size={12} color={c.muted}>
        {b.confirmationMode === "auto"
          ? t("settings.confirmAutoHint")
          : t("settings.confirmManualHint", { hours: b.manualConfirmWindowHours })}
      </Text>
      {b.confirmationMode === "manual" ? (
        <SettingRow title={t("settings.manualWindow")}>
          <NumberInput
            label={t("settings.manualWindow")}
            value={b.manualConfirmWindowHours}
            onChange={(v) => {
              set({ manualConfirmWindowHours: Math.min(72, Math.max(1, v ?? 12)) });
            }}
          />
        </SettingRow>
      ) : null}
      <SettingRow
        title={t("settings.confirmNewClients")}
        body={t("settings.confirmNewClientsHint")}
      >
        <Toggle
          value={b.confirmNewClients}
          label={t("settings.confirmNewClients")}
          onChange={(v) => {
            set({ confirmNewClients: v });
          }}
        />
      </SettingRow>
      <SettingRow title={t("settings.hideStaffChoice")} body={t("settings.hideStaffChoiceHint")}>
        <Toggle
          value={b.hideStaffChoice}
          label={t("settings.hideStaffChoice")}
          onChange={(v) => {
            set({ hideStaffChoice: v });
          }}
        />
      </SettingRow>
      <SettingRow title={t("settings.leadTime")} body={t("settings.leadTimeHint")}>
        <NumberInput
          label={t("settings.leadTime")}
          value={Math.round(b.minLeadTimeMinutes / HOURS)}
          onChange={(v) => {
            set({ minLeadTimeMinutes: (v ?? 0) * HOURS });
          }}
        />
      </SettingRow>
      <SettingRow title={t("settings.bookingWindow")} body={t("settings.bookingWindowHint")}>
        <NumberInput
          label={t("settings.bookingWindow")}
          value={b.bookingWindowDays}
          onChange={(v) => {
            set({ bookingWindowDays: Math.min(365, Math.max(1, v ?? 60)) });
          }}
        />
      </SettingRow>
      <SettingRow title={t("settings.cancelCutoff")} body={t("settings.cancelCutoffHint")}>
        <NumberInput
          label={t("settings.cancelCutoff")}
          value={Math.round(b.cancellationCutoffMinutes / HOURS)}
          onChange={(v) => {
            set({
              cancellationCutoffMinutes: (v ?? 0) * HOURS,
              rescheduleCutoffMinutes: (v ?? 0) * HOURS,
            });
          }}
        />
      </SettingRow>
      {canEdit ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 8,
          }}
        >
          {saved ? (
            <Text size={13} color={c.accent}>
              {t("common.saved")}
            </Text>
          ) : null}
          <CalmButton
            testID="crm-booking-save"
            label={save.isPending ? t("common.saving") : t("common.save")}
            onPress={() => {
              setSaved(false);
              save.mutate(b, {
                onSuccess: () => {
                  setSaved(true);
                },
              });
            }}
          />
        </View>
      ) : null}
    </CalmCard>
  );
}

/** Booking and cancellation policy shown to clients (vi; en optional later). */
export function PoliciesSection({
  settings,
  canEdit,
}: {
  settings: SalonSettings;
  canEdit: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [booking, setBooking] = useState(settings.policies.bookingPolicy?.vi ?? "");
  const [cancel, setCancel] = useState(settings.policies.cancellationPolicy?.vi ?? "");
  const [saved, setSaved] = useState(false);
  const save = useCrmMutation(crmApi.updatePolicies, ["settings"]);
  const text = (vi: string, en?: string) => (vi.trim() ? { vi: vi.trim(), en: en ?? "" } : null);
  return (
    <CalmCard style={{ gap: 12 }}>
      <Text role="uiSemiBold" size={16} color={c.ink}>
        {t("settings.policies")}
      </Text>
      <ErrorBanner text={errorText(save.error)} />
      <Field label={t("settings.bookingPolicy")} hint={t("settings.bookingPolicyHint")}>
        <Input
          multiline
          label={t("settings.bookingPolicy")}
          value={booking}
          onChangeText={setBooking}
        />
      </Field>
      <Field label={t("settings.cancellationPolicy")} hint={t("settings.cancellationPolicyHint")}>
        <Input
          multiline
          label={t("settings.cancellationPolicy")}
          value={cancel}
          onChangeText={setCancel}
        />
      </Field>
      {canEdit ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          {saved ? (
            <Text size={13} color={c.accent}>
              {t("common.saved")}
            </Text>
          ) : null}
          <CalmButton
            label={save.isPending ? t("common.saving") : t("common.save")}
            onPress={() => {
              setSaved(false);
              save.mutate(
                {
                  bookingPolicy: text(booking, settings.policies.bookingPolicy?.en),
                  cancellationPolicy: text(cancel, settings.policies.cancellationPolicy?.en),
                },
                {
                  onSuccess: () => {
                    setSaved(true);
                  },
                },
              );
            }}
          />
        </View>
      ) : null}
    </CalmCard>
  );
}
