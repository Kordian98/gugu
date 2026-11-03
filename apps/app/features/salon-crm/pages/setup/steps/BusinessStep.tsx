import { useState } from "react";
import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";

import { BUSINESS_TYPES, type BusinessType, type SetupState } from "@gugu/contracts";
import { useCalm } from "@gugu/design-system";

import { setupApi, useSetupMutation } from "../../../data/setup";
import { useErrorText } from "../../../ui/errors";
import { ErrorBanner, Field, Input } from "../../../ui/form";
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

/** Step (a): salon name and business type as big friendly tiles. */
export function BusinessStep({
  setup,
  currentName,
  eta,
  onDone,
  onSkip,
}: {
  setup: SetupState | null;
  currentName: string;
  eta: string;
  onDone: (type: BusinessType) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  // The quick-start placeholder is not a name the owner chose: start empty.
  const [name, setName] = useState(setup && !setup.nameConfirmed ? "" : currentName);
  const [type, setType] = useState<BusinessType | null>(setup?.businessType ?? null);
  const save = useSetupMutation(setupApi.business, ["summary", "settings"]);
  const ready = name.trim().length >= 2 && type !== null;
  return (
    <StepFrame
      title={t("setupWizard.business.title")}
      body={t("setupWizard.business.body")}
      eta={eta}
      footer={
        <StepFooter
          label={t("setupWizard.next")}
          disabled={!ready}
          busy={save.isPending}
          onPress={() => {
            if (!type) return;
            save.mutate(
              { name: name.trim(), businessType: type },
              {
                onSuccess: () => {
                  onDone(type);
                },
              },
            );
          }}
          onSkip={onSkip}
        />
      }
    >
      <ErrorBanner text={errorText(save.error)} />
      <Field label={t("setupWizard.business.nameLabel")}>
        <Input
          testID="crm-setup-salon-name"
          label={t("setupWizard.business.nameLabel")}
          placeholder={t("setupWizard.business.namePlaceholder")}
          value={name}
          onChangeText={setName}
        />
      </Field>
      <Field label={t("setupWizard.business.typeLabel")}>
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
                setType(bt);
              }}
            />
          ))}
        </View>
      </Field>
    </StepFrame>
  );
}
