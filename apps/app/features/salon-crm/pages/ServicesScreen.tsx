import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Text, useCalm } from "@gugu/design-system";
import type { Service } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { AiImportPanel } from "../../ai-import/AiImportPanel";
import { crmApi, useCategories, useCrmMutation, useServices, useTeam } from "../data/catalog";
import { useSalon } from "../data/SalonContext";
import { useWorkspace } from "../data/useWorkspace";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";
import { EmptyState } from "../ui/EmptyState";
import { useErrorText } from "../ui/errors";
import { ConfirmDialog, ErrorBanner } from "../ui/form";
import { ServiceEditor } from "./services/ServiceEditor";
import { ServiceRow } from "./services/ServiceRow";

/**
 * Services (07 M7.4): AI price-list import (topic 08 IMP), services grouped by category with
 * variants, add-ons, staff, active switch and ordering.
 */
export function ServicesScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const { can } = useSalon();
  const params = useLocalSearchParams<{ import?: string }>();
  const services = useServices();
  const categories = useCategories();
  const team = useTeam(can("members.read"));
  const errorText = useErrorText();
  const toggle = useCrmMutation(crmApi.setServiceActive, ["services"]);
  const reorder = useCrmMutation(crmApi.reorderServices, ["services"]);
  const remove = useCrmMutation(crmApi.removeService, ["services", "team"]);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const canEdit = can("services.write");
  const items = services.data?.items ?? [];
  const staff = team.data?.items ?? [];
  const cats = categories.data?.items ?? [];

  const move = (index: number, dir: -1 | 1) => {
    const ids = items.map((s) => s.id);
    const j = index + dir;
    const a = ids[index];
    const b = ids[j];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[j] = a;
    reorder.mutate(ids);
  };

  const groups = [
    ...cats.map((cat) => ({ id: cat.id, label: cat.name[locale] || cat.name.vi })),
    { id: "none", label: t("services.uncategorized") },
  ]
    .map((g) => ({ ...g, items: items.filter((s) => (s.categoryId ?? "none") === g.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: bp === "mobile" ? 16 : 28, gap: 20 }}
    >
      <PageHeader
        title={t("pages.services.title")}
        subtitle={t("services.subtitle")}
        workspace={ws}
      />
      <AiImportPanel
        highlight={params.import === "1" || items.length === 0}
        autoPick={params.import === "1"}
      />
      <ErrorBanner text={errorText(toggle.error ?? reorder.error ?? remove.error)} />
      <CalmCard style={{ gap: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text
            role="uiSemiBold"
            size={12}
            color={c.ink}
            style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
          >
            {t("services.listTitle", { count: items.length })}
          </Text>
          {canEdit ? (
            <CalmButton
              testID="crm-service-add"
              size="sm"
              icon="plus"
              label={t("services.add")}
              onPress={() => {
                setEditing("new");
              }}
            />
          ) : null}
        </View>
        {services.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : services.isError ? (
          <EmptyState compact icon="tag" title={t("errors.loadFailed")} />
        ) : items.length === 0 ? (
          <EmptyState
            testID="crm-services-empty"
            icon="tag"
            title={t("services.emptyTitle")}
            body={t("services.emptyBody")}
          />
        ) : (
          groups.map((g) => (
            <View key={g.id} style={{ gap: 8 }}>
              <Text role="uiMedium" size={13} color={c.body}>
                {g.label}
              </Text>
              {g.items.map((s) => {
                const index = items.indexOf(s);
                return (
                  <ServiceRow
                    key={s.id}
                    service={s}
                    staff={staff}
                    canEdit={canEdit}
                    first={index === 0}
                    last={index === items.length - 1}
                    onEdit={() => {
                      setEditing(s);
                    }}
                    onToggle={(v) => {
                      toggle.mutate({ id: s.id, isActive: v });
                    }}
                    onMove={(dir) => {
                      move(index, dir);
                    }}
                    onDelete={() => {
                      setDeleting(s);
                    }}
                  />
                );
              })}
            </View>
          ))
        )}
      </CalmCard>
      <ConfirmDialog
        testID="crm-service-delete-dialog"
        open={deleting !== null}
        title={t("services.deleteTitle", {
          name: deleting ? (locale === "en" && deleting.name.en) || deleting.name.vi : "",
        })}
        body={t("services.deleteBody")}
        confirmLabel={t("services.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        busy={remove.isPending}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting)
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
              },
            });
        }}
      />
      {editing !== null ? (
        <ServiceEditor
          key={editing === "new" ? "new" : editing.id}
          open
          service={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
          categories={cats}
          staff={staff}
        />
      ) : null}
    </ScrollView>
  );
}
