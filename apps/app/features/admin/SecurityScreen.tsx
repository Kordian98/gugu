import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { AdminMfaEnrolment } from "@gugu/contracts";
import { CalmButton, Pill, Text, useCalm } from "@gugu/design-system";
import { formatDateLong, formatTime } from "@gugu/localization";

import { copyText } from "@/services/files/share";
import { useLocale } from "@/services/i18n/useLocale";

import { ErrorBanner, Input } from "../salon-crm/ui/form";
import {
  useAdminMfa,
  useConfirmEnrolment,
  useRegenerateRecoveryCodes,
  useStartEnrolment,
} from "./data";
import { StepUpPrompt } from "./StepUpPrompt";
import { KV, LoadError, Loading, Page, Section, useAdminErrorText } from "./ui";

/**
 * Admin two-step verification (topic 05 step 9, ADR-0011): enrol a TOTP app, see recovery codes
 * once, confirm this session (step-up), regenerate codes, move to a new device. The secret is
 * shown only during enrolment; nothing here is persisted on the device.
 */
export function SecurityScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const status = useAdminMfa();
  const start = useStartEnrolment();
  const errorText = useAdminErrorText();
  const [enrolment, setEnrolment] = useState<AdminMfaEnrolment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [replacing, setReplacing] = useState(false);

  if (status.isPending) return <Loading />;
  if (!status.data) {
    return (
      <LoadError
        onRetry={() => {
          void status.refetch();
        }}
      />
    );
  }
  const s = status.data;
  const begin = () => {
    start.mutate(undefined, {
      onSuccess: (e) => {
        setEnrolment(e);
        setReplacing(false);
      },
    });
  };

  return (
    <Page testID="admin-security" title={t("security.title")} subtitle={t("security.subtitle")}>
      {codes ? (
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
          }}
        />
      ) : enrolment ? (
        <Enrol
          enrolment={enrolment}
          onDone={(c2) => {
            setEnrolment(null);
            setCodes(c2);
          }}
        />
      ) : (
        <Section title={t("security.statusTitle")}>
          <KV
            label={t("security.statusTitle")}
            value={
              s.enrolled && s.enrolledAt ? (
                <Pill
                  tone="up"
                  label={t("security.enrolled", {
                    date: formatDateLong(new Date(s.enrolledAt), locale),
                  })}
                />
              ) : (
                <Text size={14} color={c.down.text}>
                  {t("security.notEnrolled")}
                </Text>
              )
            }
          />
          {s.enrolled ? (
            <>
              <KV
                label={t("security.recoveryTitle")}
                value={t("security.recoveryLeft", { count: s.recoveryCodesRemaining })}
              />
              <Text testID="admin-security-stepup-state" size={13} color={c.body}>
                {s.stepUpUntil
                  ? t("security.stepUpActive", {
                      time: formatTime(new Date(s.stepUpUntil), locale),
                    })
                  : t("security.stepUpInactive")}
              </Text>
              {s.stepUpUntil ? null : (
                <StepUpPrompt testID="admin-security-stepup" onDone={() => void status.refetch()} />
              )}
              <Regenerate onCodes={setCodes} />
              <View style={{ gap: 6 }}>
                <CalmButton
                  testID="admin-security-replace"
                  variant="secondary"
                  label={t("security.replace")}
                  onPress={() => {
                    setReplacing(true);
                    begin();
                  }}
                />
                <Text size={12} color={c.muted}>
                  {t("security.replaceHint")}
                </Text>
              </View>
            </>
          ) : (
            <CalmButton testID="admin-security-start" label={t("security.start")} onPress={begin} />
          )}
          {replacing || !s.enrolled ? <ErrorBanner text={errorText(start.error)} /> : null}
        </Section>
      )}
    </Page>
  );
}

function Enrol({
  enrolment,
  onDone,
}: {
  enrolment: AdminMfaEnrolment;
  onDone: (codes: string[]) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const errorText = useAdminErrorText();
  const confirm = useConfirmEnrolment();
  const [code, setCode] = useState("");
  const grouped = enrolment.secret.replace(/(.{4})/g, "$1 ").trim();
  return (
    <Section title={t("security.start")}>
      <Text size={14} color={c.body}>
        {t("security.step1")}
      </Text>
      <KV
        label={t("security.secretLabel")}
        value={
          <Text
            testID="admin-security-secret"
            role="uiSemiBold"
            size={16}
            color={c.ink}
            style={{
              letterSpacing: 1,
              userSelect: "text",
              fontFamily: Platform.OS === "web" ? "monospace" : undefined,
            }}
          >
            {grouped}
          </Text>
        }
      />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <CalmButton
          size="sm"
          variant="secondary"
          label={t("security.copy")}
          onPress={() => {
            void copyText(enrolment.secret);
          }}
        />
        <CalmButton
          size="sm"
          variant="secondary"
          label={t("security.openApp")}
          onPress={() => {
            void Linking.openURL(enrolment.otpauthUri);
          }}
        />
      </View>
      <Text size={14} color={c.body}>
        {t("security.step2")}
      </Text>
      <Input
        testID="admin-security-code"
        label={t("security.codeLabel")}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
      />
      <ErrorBanner text={errorText(confirm.error)} />
      <CalmButton
        testID="admin-security-confirm"
        label={t("security.confirm")}
        variant={/^\d{6}$/.test(code.trim()) ? "primary" : "secondary"}
        onPress={() => {
          if (!/^\d{6}$/.test(code.trim())) return;
          confirm.mutate(code.trim(), {
            onSuccess: (r) => {
              onDone(r.recoveryCodes);
            },
          });
        }}
      />
    </Section>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const [copied, setCopied] = useState(false);
  return (
    <Section
      testID="admin-security-recovery"
      title={t("security.recoveryTitle")}
      body={t("security.recoveryBody")}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {codes.map((code) => (
          <View
            key={code}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: c.surfaceMuted,
              minWidth: 130,
            }}
          >
            <Text role="uiSemiBold" size={15} color={c.ink} style={{ userSelect: "text" }}>
              {code}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <CalmButton
          size="sm"
          variant="secondary"
          label={copied ? t("security.copied") : t("security.copy")}
          onPress={() => {
            void copyText(codes.join("\n")).then(() => {
              setCopied(true);
            });
          }}
        />
        <CalmButton
          testID="admin-security-recovery-done"
          size="sm"
          label={t("security.recoveryDone")}
          onPress={onDone}
        />
      </View>
    </Section>
  );
}

function Regenerate({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const errorText = useAdminErrorText();
  const regen = useRegenerateRecoveryCodes();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  if (!open) {
    return (
      <CalmButton
        variant="secondary"
        label={t("security.regenerate")}
        onPress={() => {
          setOpen(true);
        }}
      />
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Text size={13} color={c.body}>
        {t("security.regenerateHint")}
      </Text>
      <Input
        label={t("security.codeLabel")}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
      />
      <ErrorBanner text={errorText(regen.error)} />
      <CalmButton
        size="sm"
        label={t("security.regenerate")}
        onPress={() => {
          if (!/^\d{6}$/.test(code.trim())) return;
          regen.mutate(code.trim(), {
            onSuccess: (r) => {
              setOpen(false);
              setCode("");
              onCodes(r.recoveryCodes);
            },
          });
        }}
      />
    </View>
  );
}
