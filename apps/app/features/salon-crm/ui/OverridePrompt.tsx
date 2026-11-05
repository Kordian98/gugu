import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CalmButton, Text, useCalm } from "@gugu/design-system";
import type { RuleOverride } from "@gugu/contracts";

import { ErrorBanner, Input, Sheet } from "./form";

/** Separator between rule names (punctuation, not copy). */
const SEP = " \u00b7 ";

/**
 * "Outside the rules — book anyway?" (06 booking.override_required): names the broken rules and
 * asks for the reason the API audits. Only for members with bookings.override_rules.
 */
export function OverridePrompt({
  codes,
  busy,
  onConfirm,
  onCancel,
  extra,
  error,
  disabled = false,
}: {
  codes: RuleOverride[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  extra?: ReactNode;
  error?: string | null | undefined;
  disabled?: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3 && reason.trim().length <= 500 && !busy && !disabled;
  return (
    <Sheet
      open
      onClose={onCancel}
      dismissDisabled={busy}
      closeLabel={t("common.close")}
      title={t("override.title")}
      footer={
        <>
          <CalmButton
            variant="secondary"
            label={t("common.cancel")}
            onPress={onCancel}
            disabled={busy}
          />
          <CalmButton
            testID="crm-override-confirm"
            disabled={!ok}
            label={busy ? t("common.saving") : t("override.confirm")}
            onPress={() => {
              if (ok) onConfirm(reason.trim());
            }}
          />
        </>
      }
    >
      <ErrorBanner text={error ?? null} />
      <Text size={13} color={c.muted}>
        {t("override.rulesLabel")}
      </Text>
      <Text testID="crm-override-prompt" size={14} color={c.body}>
        {codes.map((x) => t(`override.codes.${x}`)).join(SEP)}
      </Text>
      <Text size={13} color={c.muted}>
        {t("override.body")}
      </Text>
      {extra}
      <Input
        testID="crm-override-prompt-reason"
        label={t("calendar.overrideReason")}
        placeholder={t("override.placeholder")}
        value={reason}
        onChangeText={setReason}
      />
    </Sheet>
  );
}
