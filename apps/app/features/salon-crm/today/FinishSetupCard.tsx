import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { SetupItem, SetupState } from "@gugu/contracts";
import { Icon, type IconName, Text, useCalm } from "@gugu/design-system";

import { setupApi, useSetupMutation } from "../data/setup";
import { useZaloConnection } from "../data/zalo";
import { useCrmNav } from "../shell/useCrmNav";

const ICON: Record<SetupItem, IconName> = {
  business: "store",
  hours: "clock",
  services: "tag",
  team: "team",
  zalo: "chat",
};

/** Items the card would show; empty means the card must not render (completed salons). */
export function finishSetupItems(setup: SetupState | null, zaloDisabled: boolean): SetupItem[] {
  if (!setup?.wizardClosed || setup.cardDismissed) return [];
  return setup.remaining.filter((i) => !(i === "zalo" && zaloDisabled));
}

/**
 * Compact "finish setup" card on Today after the guided setup (owner 2026-11-04): only the optional
 * items still open (from real data), each opening that one wizard step. Disappears when everything
 * is done or the owner hides it, and never renders for completed salons.
 */
export function FinishSetupCard({ setup }: { setup: SetupState | null }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { go } = useCrmNav();
  const zalo = useZaloConnection();
  const dismiss = useSetupMutation(setupApi.dismissCard);
  const items = finishSetupItems(setup, zalo.data?.mode === "disabled");
  if (items.length === 0 || dismiss.isSuccess) return null;
  return (
    <View
      testID="crm-finish-setup"
      style={{
        gap: 12,
        padding: 18,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.accentSoft,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text role="uiSemiBold" size={17} color={c.ink}>
            {t("finishSetup.title")}
          </Text>
          <Text size={14} color={c.body}>
            {t("finishSetup.body")}
          </Text>
        </View>
        <Pressable
          testID="crm-finish-setup-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t("finishSetup.dismiss")}
          onPress={() => {
            dismiss.mutate(undefined);
          }}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="close" size={18} color={c.muted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {items.map((item) => (
          <Pressable
            key={item}
            testID={`crm-finish-setup-${item}`}
            accessibilityRole="button"
            accessibilityLabel={t(`finishSetup.items.${item}`)}
            onPress={() => {
              go(`/business/setup?step=${item}&single=1`);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: 14,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Icon name={ICON[item]} size={16} color={c.accent} />
            <Text role="uiMedium" size={14} color={c.ink}>
              {t(`finishSetup.items.${item}`)}
            </Text>
            <Icon name="chevronRight" size={14} color={c.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
