import { useState, type ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import Head from "expo-router/head";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, Icon, Pill, Text, useCalm } from "@gugu/design-system";

import type { Workspace } from "../data/types";
import { useBreakpoint } from "./useBreakpoint";
import { useCrmNav } from "./useCrmNav";

/**
 * Page title row + top-bar actions (ref crm-01): search, location (Ultra only), new appointment,
 * notifications, avatar. On mobile only the title renders; actions live in the mobile header/tabs.
 */
export function PageHeader({
  title,
  subtitle,
  workspace,
}: {
  title: string;
  subtitle?: string | undefined;
  workspace: Workspace;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const bp = useBreakpoint();
  const { go, newAppointment } = useCrmNav();
  const [query, setQuery] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const mobile = bp === "mobile";

  return (
    <>
      <Head>
        <title>{t("shell.docTitle", { page: title })}</title>
      </Head>
      <View
        style={{
          flexDirection: mobile ? "column" : "row",
          alignItems: mobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 16,
          zIndex: 10,
        }}
      >
        <View style={{ gap: 4, flexShrink: 1 }}>
          <Text
            role="uiSemiBold"
            size={mobile ? 22 : 26}
            lineHeight={mobile ? 28 : 32}
            color={c.ink}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text size={14} color={c.body}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {mobile ? null : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 0 }}>
            {workspace.demo ? <Pill label={tc("demo.notice")} tone="brand" /> : null}
            {bp === "wide" ? (
              <Field>
                <Icon name="search" size={16} color={c.muted} />
                <TextInput
                  testID="crm-search"
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => {
                    go(`/business/customers?q=${encodeURIComponent(query)}`);
                  }}
                  placeholder={t("shell.searchPlaceholder")}
                  placeholderTextColor={c.muted}
                  accessibilityLabel={t("shell.searchPlaceholder")}
                  style={{ flex: 1, width: 190, color: c.ink, fontSize: 14, outlineWidth: 0 }}
                />
              </Field>
            ) : null}
            {workspace.plan === "ultra" ? (
              <Field>
                <Icon name="pin" size={16} color={c.ink} />
                <Text role="uiMedium" size={14} color={c.ink}>
                  {t("shell.allLocations")}
                </Text>
              </Field>
            ) : null}
            <CalmButton
              testID="crm-new-appointment"
              icon="plus"
              label={t("shell.newAppointment")}
              onPress={() => {
                newAppointment();
              }}
            />
            <View>
              <Pressable
                testID="crm-bell"
                accessibilityRole="button"
                accessibilityLabel={t("shell.notifications")}
                accessibilityState={{ expanded: bellOpen }}
                onPress={() => {
                  setBellOpen((o) => !o);
                }}
                style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="bell" size={20} color={c.ink} />
              </Pressable>
              {bellOpen ? (
                <View
                  style={{
                    position: "absolute",
                    top: 46,
                    right: 0,
                    width: 260,
                    padding: 16,
                    gap: 6,
                    borderRadius: 14,
                    backgroundColor: c.surface,
                    borderWidth: 1,
                    borderColor: c.line,
                    shadowColor: c.shadow,
                    shadowOpacity: 0.12,
                    shadowRadius: 20,
                    shadowOffset: { width: 0, height: 8 },
                  }}
                >
                  <Text role="uiSemiBold" size={14} color={c.ink}>
                    {t("shell.notifications")}
                  </Text>
                  <Text size={13} color={c.body}>
                    {t("shell.noNotifications")}
                  </Text>
                </View>
              ) : null}
            </View>
            <Avatar name={workspace.user?.name} size={40} />
          </View>
        )}
      </View>
    </>
  );
}

function Field({ children }: { children: ReactNode }) {
  const { c } = useCalm();
  return (
    <View
      style={{
        height: 40,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
