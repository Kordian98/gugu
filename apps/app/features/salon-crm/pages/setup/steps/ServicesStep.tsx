import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import type { BusinessType, Service, SetupMethod } from "@gugu/contracts";
import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { AiImportPanel } from "../../../../ai-import/AiImportPanel";
import { useAiImportStatus } from "../../../../ai-import/data";
import { crmApi, useCrmMutation } from "../../../data/catalog";
import { useErrorText } from "../../../ui/errors";
import { ErrorBanner, Field, Input, MoneyInput, NumberInput, Segmented } from "../../../ui/form";
import { TemplatePicker } from "./TemplatePicker";
import { StepFooter, StepFrame } from "../parts/StepFrame";

/**
 * Step (c): services three ways. The AI price-list import stays the first, hero option (X13, every
 * plan; no personal data, X10) and degrades to a friendly note when it is not configured or not in
 * the plan. Then a starter template for the business type (editable names, durations, prices) or a
 * quick manual add. The salon's list below fills in live as services are created.
 */
export function ServicesStep({
  services,
  businessType,
  eta,
  onDone,
  onSkip,
  onBack,
}: {
  services: Service[];
  businessType: BusinessType | null;
  eta: string;
  onDone: (method: SetupMethod) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("crm");
  const [tab, setTab] = useState<"template" | "manual">("template");
  const [method, setMethod] = useState<SetupMethod | null>(null);
  const active = services.filter((s) => s.isActive);
  return (
    <StepFrame
      title={t("setupWizard.services.title")}
      body={t("setupWizard.services.body")}
      eta={eta}
      footer={
        <StepFooter
          label={t("setupWizard.next")}
          onPress={() => {
            if (active.length > 0) onDone(method ?? "manual");
            else onSkip();
          }}
          onSkip={onSkip}
          onBack={onBack}
        />
      }
    >
      <AiHero
        onOpen={() => {
          setMethod("ai_import");
        }}
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "template", label: t("setupWizard.services.tabTemplate") },
          { id: "manual", label: t("setupWizard.services.tabManual") },
        ]}
      />
      {tab === "template" ? (
        <TemplatePicker
          type={businessType ?? "mixed"}
          existing={services}
          onAdded={() => {
            setMethod((m) => m ?? "template");
          }}
        />
      ) : (
        <ManualAdd
          onAdded={() => {
            setMethod((m) => m ?? "manual");
          }}
        />
      )}
      <ServiceList services={active} />
    </StepFrame>
  );
}

function AiHero({ onOpen }: { onOpen: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const status = useAiImportStatus();
  const [open, setOpen] = useState(false);
  const available = status.data?.configured === true && status.data.entitled;
  if (open && available) {
    return (
      <View testID="crm-setup-ai-panel">
        <AiImportPanel highlight autoPick />
      </View>
    );
  }
  const note =
    status.data?.configured === false
      ? t("setupWizard.services.aiUnavailable")
      : status.data?.entitled === false
        ? t("setupWizard.services.aiNotEntitled")
        : null;
  return (
    <View
      testID={available ? "crm-setup-ai" : "crm-setup-ai-unavailable"}
      style={{
        gap: 10,
        padding: 18,
        borderRadius: 20,
        borderWidth: 1.5,
        borderStyle: available ? "dashed" : "solid",
        borderColor: available ? c.accentBg : c.line,
        backgroundColor: c.accentSoft,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="sparkles" size={20} color={c.accent} />
        </View>
        <Text role="uiSemiBold" size={17} color={c.ink} style={{ flex: 1 }}>
          {t("setupWizard.services.aiTitle")}
        </Text>
      </View>
      {status.isPending ? (
        <ActivityIndicator color={c.accent} style={{ alignSelf: "flex-start" }} />
      ) : (
        <Text size={14} color={c.body}>
          {note ?? t("setupWizard.services.aiBody")}
        </Text>
      )}
      {available ? (
        <CalmButton
          testID="crm-setup-ai-pick"
          icon="upload"
          label={t("setupWizard.services.aiCta")}
          onPress={() => {
            setOpen(true);
            onOpen();
          }}
        />
      ) : null}
    </View>
  );
}

function ManualAdd({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(30);
  const create = useCrmMutation(crmApi.createService, ["services", "team"]);
  return (
    <View testID="crm-setup-manual" style={{ gap: 10 }}>
      <ErrorBanner text={errorText(create.error)} />
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field flex={2} label={t("services.nameVi")}>
          <Input
            testID="crm-setup-service-name"
            label={t("services.nameVi")}
            placeholder={t("wizard.servicePlaceholder")}
            value={name}
            onChangeText={setName}
          />
        </Field>
        <Field flex={1} label={t("services.price")}>
          <MoneyInput
            testID="crm-setup-service-price"
            label={t("services.price")}
            value={price}
            onChange={setPrice}
          />
        </Field>
        <Field label={t("services.duration")}>
          <NumberInput label={t("services.duration")} value={duration} onChange={setDuration} />
        </Field>
      </View>
      <CalmButton
        testID="crm-setup-service-add"
        icon="plus"
        label={t("services.add")}
        onPress={() => {
          if (!name.trim() || price === null || (duration ?? 0) < 5 || create.isPending) return;
          create.mutate(
            { name: { vi: name.trim() }, price, durationMinutes: duration ?? 30 },
            {
              onSuccess: () => {
                setName("");
                setPrice(null);
                onAdded();
              },
            },
          );
        }}
      />
    </View>
  );
}

/** The salon's services, appearing one by one as they are created (respects reduced motion). */
function ServiceList({ services }: { services: Service[] }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  return (
    <View
      testID="crm-setup-service-list"
      style={{
        gap: 8,
        padding: 16,
        borderRadius: 18,
        backgroundColor: c.surfaceMuted,
      }}
    >
      <Text role="uiSemiBold" size={14} color={c.ink}>
        {`${t("setupWizard.services.listTitle")} · ${String(services.length)}`}
      </Text>
      {services.length === 0 ? (
        <Text size={14} color={c.muted}>
          {t("setupWizard.services.empty")}
        </Text>
      ) : (
        services.map((s, i) => (
          <Animated.View
            key={s.id}
            entering={FadeInDown.delay(Math.min(i, 8) * 70).duration(320)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 }}
          >
            <Icon name="check" size={16} color={c.accent} strokeWidth={2.4} />
            <Text size={15} color={c.ink} style={{ flex: 1 }}>
              {(locale === "en" && s.name.en) || s.name.vi}
            </Text>
            <Text size={13} color={c.body}>
              {`${formatVND(s.price, locale)} · ${t("services.minutes", { count: s.durationMinutes })}`}
            </Text>
          </Animated.View>
        ))
      )}
    </View>
  );
}
