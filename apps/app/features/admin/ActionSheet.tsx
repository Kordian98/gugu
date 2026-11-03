import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { ADMIN_ERRORS, ADMIN_STEP_UP_MINUTES } from "@gugu/contracts";
import { CalmButton, DatePicker, Pill, Text, useCalm } from "@gugu/design-system";

import { ApiError } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { ErrorBanner, Field, Input, Sheet } from "../salon-crm/ui/form";
import { type AdminAction, useAdminAction } from "./data";
import { addDays } from "./format";
import { useAdminErrorText } from "./ui";

const MIN_REASON = 5;

/**
 * Editor for one admin write. Every action needs a reason (stored in the audit log). High-risk
 * actions need a recent sign-in: on `admin.step_up_required` the sheet offers to sign in again.
 */
export function ActionSheet(props: ActionSheetProps) {
  // Mounted only while open, so the reason and the mutation state start fresh every time.
  return props.open ? <OpenActionSheet {...props} /> : null;
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  salonId: string;
  title: string;
  body?: string | undefined;
  highRisk?: boolean | undefined;
  /** The request for the given reason, or null while the form is incomplete. */
  build: (reason: string) => AdminAction | null;
  children?: ReactNode;
  testID?: string;
}

function OpenActionSheet({
  onClose,
  salonId,
  title,
  body,
  highRisk,
  build,
  children,
  testID,
}: ActionSheetProps) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const [reason, setReason] = useState("");
  const action = useAdminAction(salonId);
  const errorText = useAdminErrorText();
  const auth = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();

  const trimmed = reason.trim();
  const request = trimmed.length >= MIN_REASON ? build(trimmed) : null;
  const stepUp =
    action.error instanceof ApiError && action.error.code === ADMIN_ERRORS.stepUpRequired;

  const submit = () => {
    if (!request) return;
    action.mutate(request, { onSuccess: onClose });
  };
  const signInAgain = async () => {
    await auth.signOut();
    router.replace(`/${locale}/sign-in?next=${encodeURIComponent(pathname)}` as never);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton
            testID={testID ? `${testID}-submit` : undefined}
            label={action.isPending ? t("actions.saving") : t("actions.submit")}
            onPress={submit}
            variant={request && !action.isPending ? "primary" : "secondary"}
          />
        </>
      }
    >
      {body ? (
        <Text size={14} color={c.body}>
          {body}
        </Text>
      ) : null}
      {highRisk ? <Pill label={t("actions.highRisk")} tone="down" /> : null}
      {children}
      <Field label={t("actions.reason")} hint={t("actions.reasonHint")}>
        <Input
          testID={testID ? `${testID}-reason` : undefined}
          label={t("actions.reason")}
          value={reason}
          onChangeText={setReason}
          multiline
        />
      </Field>
      {stepUp ? (
        <View
          style={{
            gap: 10,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
          }}
        >
          <Text role="uiSemiBold" size={14} color={c.ink}>
            {t("actions.stepUpTitle")}
          </Text>
          <Text size={13} color={c.body}>
            {t("actions.stepUpBody", { minutes: ADMIN_STEP_UP_MINUTES })}
          </Text>
          <CalmButton
            size="sm"
            label={t("actions.stepUpAction")}
            onPress={() => {
              void signInAgain();
            }}
          />
        </View>
      ) : (
        <ErrorBanner text={errorText(action.error)} />
      )}
    </Sheet>
  );
}

/** Calendar day picker with quick presets (dates are Vietnam calendar days). */
export function DayField({
  label,
  hint,
  value,
  onChange,
  today,
  max,
  presets,
}: {
  label: string;
  hint?: string | undefined;
  value: string | null;
  onChange: (ymd: string) => void;
  today: string;
  max?: string | undefined;
  presets: { label: string; days: number }[];
}) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  return (
    <Field label={label} hint={hint}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {presets.map((p) => (
          <CalmButton
            key={p.label}
            size="sm"
            variant="secondary"
            label={p.label}
            onPress={() => {
              onChange(addDays(today, p.days));
            }}
          />
        ))}
      </View>
      <DatePicker
        value={value}
        onChange={onChange}
        today={today}
        min={addDays(today, 1)}
        max={max}
        localeTag={locale === "vi" ? "vi-VN" : "en-US"}
        prevLabel={t("actions.prevMonth")}
        nextLabel={t("actions.nextMonth")}
      />
    </Field>
  );
}
