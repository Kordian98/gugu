import { useState } from "react";
import { Image, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { BUSINESS_TYPES, type BusinessType, type SetupState } from "@gugu/contracts";
import { Icon, Text, font, useCalm } from "@gugu/design-system";
import { formatDateLong } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { setupApi, useSetupMutation } from "../../../data/setup";
import { useErrorText } from "../../../ui/errors";
import { ErrorBanner, Field } from "../../../ui/form";
import { CheckPop } from "../parts/Celebrate";
import { selectHaptic } from "../parts/haptics";
import { ChoiceTile, StepFooter, StepFrame } from "../parts/StepFrame";

// Brand illustrations (same assets as the marketing category tiles).
const ART: Record<BusinessType, number[]> = {
  nails: [require("../../../../../assets/home/cat-nails.webp") as number],
  hair: [require("../../../../../assets/home/cat-hair.webp") as number],
  spa: [require("../../../../../assets/home/cat-massage.webp") as number],
  lashes_brows: [require("../../../../../assets/home/cat-lashes.webp") as number],
  mixed: [
    require("../../../../../assets/home/cat-nails.webp") as number,
    require("../../../../../assets/home/cat-hair.webp") as number,
    require("../../../../../assets/home/cat-lashes.webp") as number,
  ],
};

function TileArt({ type }: { type: BusinessType }) {
  const { c } = useCalm();
  const images = ART[type];
  const size = images.length > 1 ? 34 : 52;
  return (
    <View
      style={{
        height: 60,
        width: 60,
        borderRadius: 30,
        backgroundColor: c.accentSoft,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
      }}
    >
      {images.map((src, i) => (
        <Image
          key={String(i)}
          source={src}
          accessibilityIgnoresInvertColors
          style={{ width: size, height: size, marginHorizontal: images.length > 1 ? -8 : 0 }}
        />
      ))}
    </View>
  );
}

type NameIssue = "short" | "long" | null;
const nameIssue = (raw: string): NameIssue => {
  const n = raw.trim().length;
  return n < 2 ? "short" : n > 80 ? "long" : null;
};

/** Live preview: the name as it will sit on top of the salon's calendar. */
function CalendarHeaderPreview({ name }: { name: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  return (
    <View
      testID="crm-setup-name-preview"
      accessibilityLabel={t("setupWizard.business.previewLabel")}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
        padding: 14,
        gap: 8,
      }}
    >
      <Text size={12} color={c.muted}>
        {t("setupWizard.business.previewLabel")}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="calendar" size={18} color={c.accent} />
        <Text role="uiSemiBold" size={17} color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
          {name.trim() || t("setupWizard.business.namePlaceholder")}
        </Text>
        <Text size={13} color={c.body}>
          {formatDateLong(new Date(), locale)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.surfaceMuted }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Step (a): the salon name — mandatory and not skippable (q103: no default name; nothing else opens
 * before it) — with friendly inline validation (trimmed, 2–80), a live preview on the calendar
 * header and a check pop when valid. The business-type tiles below are optional.
 */
export function BusinessStep({
  setup,
  currentName,
  eta,
  onDone,
}: {
  setup: SetupState | null;
  currentName: string;
  eta: string;
  onDone: (type: BusinessType | null) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [name, setName] = useState(setup && !setup.nameConfirmed ? "" : currentName);
  const [touched, setTouched] = useState(false);
  const [type, setType] = useState<BusinessType | null>(setup?.businessType ?? null);
  const save = useSetupMutation(setupApi.business, ["summary", "settings"]);
  const issue = nameIssue(name);
  const showIssue = issue !== null && (touched || name.trim().length > 0);
  return (
    <StepFrame
      title={t("setupWizard.business.title")}
      body={t("setupWizard.business.body")}
      eta={eta}
      footer={
        <StepFooter
          label={t("setupWizard.next")}
          disabled={issue !== null}
          busy={save.isPending}
          hint={issue === "short" && !showIssue ? t("setupWizard.business.nameTooShort") : null}
          onPress={() => {
            save.mutate(
              { name: name.trim(), businessType: type },
              {
                onSuccess: () => {
                  onDone(type);
                },
              },
            );
          }}
        />
      }
    >
      <ErrorBanner text={errorText(save.error)} />
      <View style={{ gap: 8 }}>
        <Text role="uiMedium" size={14} color={c.body}>
          {t("setupWizard.business.nameLabel")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TextInput
            testID="crm-setup-salon-name"
            accessibilityLabel={t("setupWizard.business.nameLabel")}
            placeholder={t("setupWizard.business.namePlaceholder")}
            placeholderTextColor={c.muted}
            value={name}
            onChangeText={setName}
            onBlur={() => {
              setTouched(true);
            }}
            autoFocus
            maxLength={100}
            style={{
              flex: 1,
              minHeight: 60,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: showIssue ? c.attention : issue === null ? c.accentBg : c.line,
              backgroundColor: c.surface,
              paddingHorizontal: 16,
              fontSize: 22,
              fontFamily: font.uiSemiBold,
              color: c.ink,
            }}
          />
          {issue === null ? <CheckPop size={36} testID="crm-setup-name-ok" /> : null}
        </View>
        {showIssue ? (
          <Text testID="crm-setup-name-issue" size={13} color={c.attention}>
            {issue === "short"
              ? t("setupWizard.business.nameTooShort")
              : t("setupWizard.business.nameTooLong")}
          </Text>
        ) : issue === null ? (
          <Text size={13} color={c.accent}>
            {t("setupWizard.business.nameOk")}
          </Text>
        ) : null}
      </View>
      <CalendarHeaderPreview name={name} />
      <Field
        label={t("setupWizard.business.typeLabel")}
        hint={t("setupWizard.business.typeOptional")}
      >
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("setupWizard.business.typeLabel")}
          role="radiogroup"
          aria-label={t("setupWizard.business.typeLabel")}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
        >
          {BUSINESS_TYPES.map((bt) => (
            <ChoiceTile
              key={bt}
              testID={`crm-setup-type-${bt}`}
              label={t(`setupWizard.business.types.${bt}`)}
              selected={type === bt}
              minWidth={120}
              art={<TileArt type={bt} />}
              onPress={() => {
                selectHaptic();
                setType((cur) => (cur === bt ? null : bt));
              }}
            />
          ))}
        </View>
      </Field>
    </StepFrame>
  );
}
