import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Text, useCalm } from "@gugu/design-system";
import { AI_IMPORT_MAX_IMAGES } from "@gugu/contracts";

import { useErrorText } from "../salon-crm/ui/errors";
import { ErrorBanner } from "../salon-crm/ui/form";
import type { PickedImage } from "./data";
import { PanelHeader, PrivacyNote } from "./parts";

/** Selected images with the privacy note; "Read price list" sends them for gated extraction. */
export function PickedStage({
  images,
  reading,
  error,
  onRemove,
  onAddMore,
  onRead,
  onCancel,
}: {
  images: PickedImage[];
  reading: boolean;
  error: unknown;
  onRemove: (index: number) => void;
  onAddMore: () => void;
  onRead: () => void;
  onCancel: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  return (
    <CalmCard testID="ai-import-picked" style={{ gap: 14 }}>
      <PanelHeader
        title={t("setup.title")}
        subtitle={t("aiImport.pickHint", { max: String(AI_IMPORT_MAX_IMAGES) })}
      />
      <PrivacyNote />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {images.map((img, i) => (
          <Thumb
            key={img.uri}
            uri={img.uri}
            label={t("aiImport.removeImage", { index: String(i + 1) })}
            onRemove={
              reading
                ? null
                : () => {
                    onRemove(i);
                  }
            }
          />
        ))}
      </View>
      <Text size={12} color={c.muted}>
        {t("aiImport.selected", { count: String(images.length) })}
      </Text>
      <ErrorBanner text={errorText(error)} />
      {reading ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
        >
          <ActivityIndicator color={c.accent} />
          <View style={{ flex: 1 }}>
            <Text role="uiMedium" size={14} color={c.ink}>
              {t("aiImport.reading")}
            </Text>
            <Text size={12} color={c.muted}>
              {t("aiImport.readingHint")}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <CalmButton
            testID="ai-import-read"
            icon="sparkles"
            label={t("aiImport.read")}
            onPress={onRead}
          />
          {images.length < AI_IMPORT_MAX_IMAGES ? (
            <CalmButton
              variant="secondary"
              icon="plus"
              label={t("aiImport.addMore")}
              onPress={onAddMore}
            />
          ) : null}
          <CalmButton variant="ghost" label={t("common.cancel")} onPress={onCancel} />
        </View>
      )}
    </CalmCard>
  );
}

function Thumb({
  uri,
  label,
  onRemove,
}: {
  uri: string;
  label: string;
  onRemove: (() => void) | null;
}) {
  const { c } = useCalm();
  return (
    <View style={{ width: 96, height: 96 }}>
      <Image
        source={{ uri }}
        style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: c.surfaceMuted }}
        resizeMode="cover"
      />
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onRemove}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.surface,
          }}
        >
          <Icon name="close" size={14} color={c.body} />
        </Pressable>
      ) : null}
    </View>
  );
}
