import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import { MAX_RESOURCE_CAPACITY, type Resource, type ResourceType } from "@gugu/contracts";

import { crmApi, useCrmMutation, useResources } from "../../data/catalog";
import { useSalon } from "../../data/SalonContext";
import { useWorkspace } from "../../data/useWorkspace";
import { PageHeader } from "../../shell/PageHeader";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { QueryError } from "../../ui/QueryError";
import { EmptyState } from "../../ui/EmptyState";
import { useErrorText } from "../../ui/errors";
import { ConfirmDialog, ErrorBanner, Input, NumberInput, Sheet, Toggle } from "../../ui/form";

/**
 * Rooms & equipment (06 M6.6 engine, 07 UI): resource types (e.g. "Giường massage") with resources
 * and their capacity (identical units). Services pick the types they need in the service editor;
 * availability then needs a free staff member AND free units.
 */
export function ResourcesScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const { can } = useSalon();
  const canEdit = can("services.write");
  const list = useResources();
  const [adding, setAdding] = useState(false);
  const items = list.data?.items ?? [];
  const mobile = bp === "mobile";

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}
    >
      {list.isError && list.data ? (
        <QueryError
          testID="crm-resources-refresh-error"
          busy={list.isFetching}
          onRetry={() => {
            void list.refetch();
          }}
        />
      ) : null}
      <PageHeader
        title={t("pages.resources.title")}
        subtitle={t("resources.subtitle")}
        workspace={ws}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Text size={13} color={c.body} style={{ flex: 1, minWidth: 240 }}>
          {t("resources.explainer")}
        </Text>
        {canEdit ? (
          <CalmButton
            testID="crm-resource-type-add"
            icon="plus"
            label={t("resources.addType")}
            onPress={() => {
              setAdding(true);
            }}
          />
        ) : null}
      </View>
      {list.isPending ? (
        <ActivityIndicator color={c.accent} />
      ) : list.isError && !list.data ? (
        <QueryError
          testID="crm-list-error"
          busy={list.isFetching}
          onRetry={() => {
            void list.refetch();
          }}
        />
      ) : items.length === 0 ? (
        <CalmCard>
          <EmptyState
            testID="crm-resources-empty"
            icon="box"
            title={t("pages.resources.emptyTitle")}
            body={t("pages.resources.emptyBody")}
          />
        </CalmCard>
      ) : (
        items.map((type) => <TypeCard key={type.id} type={type} canEdit={canEdit} />)
      )}
      {adding ? (
        <AddTypeSheet
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function TypeCard({ type, canEdit }: { type: ResourceType; canEdit: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [name, setName] = useState(type.name);
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState<number | null>(1);
  const [confirm, setConfirm] = useState(false);
  const rename = useCrmMutation(crmApi.updateResourceType, ["resources"]);
  const remove = useCrmMutation(crmApi.removeResourceType, ["resources", "services"]);
  const create = useCrmMutation(crmApi.createResource, ["resources"]);
  const units = type.resources.filter((r) => r.isActive).reduce((n, r) => n + r.capacity, 0);
  const inUse = type.requiredByServiceCount > 0;
  return (
    <CalmCard testID={`crm-resource-type-${type.id}`} style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Icon name="box" size={18} color={c.accent} />
        {canEdit ? (
          <View style={{ flex: 1, minWidth: 180 }}>
            <Input
              label={t("resources.typeName")}
              value={name}
              onChangeText={setName}
              onBlur={() => {
                if (name.trim() && name.trim() !== type.name)
                  rename.mutate({ id: type.id, body: { name: name.trim() } });
              }}
            />
          </View>
        ) : (
          <Text role="uiSemiBold" size={16} color={c.ink} style={{ flex: 1 }}>
            {type.name}
          </Text>
        )}
        <Pill size={11} tone="accent" label={t("resources.units", { count: units })} />
        <Pill
          size={11}
          tone={inUse ? "brand" : "neutral"}
          label={t("resources.requiredBy", { count: type.requiredByServiceCount })}
        />
        {canEdit ? (
          <Pressable
            testID={`crm-resource-type-delete-${type.id}`}
            accessibilityRole="button"
            accessibilityLabel={t("resources.deleteType", { name: type.name })}
            onPress={() => {
              setConfirm(true);
            }}
            style={{ padding: 6 }}
          >
            <Icon name="trash" size={16} color={c.body} />
          </Pressable>
        ) : null}
      </View>
      <ErrorBanner text={errorText(rename.error ?? remove.error ?? create.error)} />
      {type.resources.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("resources.noResources")}
        </Text>
      ) : (
        type.resources.map((r) => <ResourceRow key={r.id} r={r} canEdit={canEdit} />)
      )}
      {canEdit ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Input
              testID={`crm-resource-new-name-${type.id}`}
              label={t("resources.resourceName")}
              placeholder={t("resources.resourcePlaceholder")}
              value={newName}
              onChangeText={setNewName}
            />
          </View>
          <View style={{ width: 110 }}>
            <NumberInput label={t("resources.capacity")} value={newCap} onChange={setNewCap} />
          </View>
          <CalmButton
            testID={`crm-resource-add-${type.id}`}
            size="sm"
            variant="secondary"
            icon="plus"
            label={t("resources.addResource")}
            onPress={() => {
              if (!newName.trim()) return;
              create.mutate(
                {
                  resourceTypeId: type.id,
                  name: newName.trim(),
                  capacity: Math.min(MAX_RESOURCE_CAPACITY, Math.max(1, newCap ?? 1)),
                },
                {
                  onSuccess: () => {
                    setNewName("");
                    setNewCap(1);
                  },
                },
              );
            }}
          />
        </View>
      ) : null}
      <ConfirmDialog
        testID="crm-resource-type-delete-dialog"
        open={confirm}
        title={t("resources.deleteType", { name: type.name })}
        body={
          errorText(remove.error) ??
          (inUse
            ? t("resources.deleteTypeInUse", { count: type.requiredByServiceCount })
            : t("resources.deleteTypeBody"))
        }
        confirmLabel={inUse ? t("common.close") : t("common.delete")}
        cancelLabel={t("common.cancel")}
        busy={remove.isPending}
        onCancel={() => {
          setConfirm(false);
        }}
        onConfirm={() => {
          if (inUse) {
            setConfirm(false);
            return;
          }
          remove.mutate(type.id, {
            onSuccess: () => {
              setConfirm(false);
            },
          });
        }}
      />
    </CalmCard>
  );
}

function ResourceRow({ r, canEdit }: { r: Resource; canEdit: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [cap, setCap] = useState<number | null>(r.capacity);
  const [confirm, setConfirm] = useState(false);
  const update = useCrmMutation(crmApi.updateResource, ["resources"]);
  const remove = useCrmMutation(crmApi.removeResource, ["resources"]);
  const saveCap = () => {
    const v = Math.min(MAX_RESOURCE_CAPACITY, Math.max(1, cap ?? 1));
    if (v !== r.capacity)
      update.mutate(
        { id: r.id, body: { capacity: v } },
        {
          onError: () => {
            setCap(r.capacity);
          },
        },
      );
  };
  return (
    <View testID={`crm-resource-${r.id}`} style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
          opacity: r.isActive ? 1 : 0.6,
        }}
      >
        <Text role="uiMedium" size={14} color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
          {r.name}
        </Text>
        {canEdit ? (
          <>
            <View style={{ width: 96 }}>
              <NumberInput
                label={t("resources.capacity")}
                value={cap}
                onChange={setCap}
                onBlur={saveCap}
              />
            </View>
            <Toggle
              value={r.isActive}
              label={t("resources.active", { name: r.name })}
              onChange={(v) => {
                update.mutate({ id: r.id, body: { isActive: v } });
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("resources.deleteResource", { name: r.name })}
              testID={`crm-resource-delete-${r.id}`}
              disabled={remove.isPending}
              onPress={() => {
                setConfirm(true);
              }}
              style={{ padding: 6 }}
            >
              <Icon name="trash" size={15} color={c.body} />
            </Pressable>
          </>
        ) : (
          <Text size={13} color={c.body}>
            {t("resources.units", { count: r.capacity })}
          </Text>
        )}
      </View>
      <ErrorBanner text={errorText(update.error ?? remove.error)} />
      <ConfirmDialog
        testID="crm-resource-delete-dialog"
        open={confirm}
        title={t("resources.deleteResource", { name: r.name })}
        body={errorText(remove.error) ?? t("resources.deleteResourceBody")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        busy={remove.isPending}
        onCancel={() => {
          if (!remove.isPending) setConfirm(false);
        }}
        onConfirm={() => {
          if (!remove.isPending)
            remove.mutate(r.id, {
              onSuccess: () => {
                setConfirm(false);
              },
            });
        }}
      />
    </View>
  );
}

function AddTypeSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [first, setFirst] = useState("");
  const [cap, setCap] = useState<number | null>(1);
  const [createdTypeId, setCreatedTypeId] = useState<string | null>(null);
  const createType = useCrmMutation(crmApi.createResourceType, ["resources"]);
  const createRes = useCrmMutation(crmApi.createResource, ["resources"]);
  const busy = createType.isPending || createRes.isPending;
  const save = () => {
    if (busy || !name.trim()) return;
    const addResource = (resourceTypeId: string) => {
      if (!first.trim()) {
        onClose();
        return;
      }
      createRes.mutate(
        {
          resourceTypeId,
          name: first.trim(),
          capacity: Math.min(MAX_RESOURCE_CAPACITY, Math.max(1, cap ?? 1)),
        },
        { onSuccess: onClose },
      );
    };
    if (createdTypeId) {
      addResource(createdTypeId);
      return;
    }
    createType.mutate(
      { name: name.trim() },
      {
        onSuccess: (r) => {
          setCreatedTypeId(r.id);
          addResource(r.id);
        },
      },
    );
  };
  return (
    <Sheet
      open
      dismissDisabled={busy}
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("resources.addType")}
      footer={
        <>
          <CalmButton
            variant="secondary"
            disabled={busy}
            label={t("common.cancel")}
            onPress={onClose}
          />
          <CalmButton
            disabled={busy || !name.trim()}
            testID="crm-resource-type-save"
            label={busy ? t("common.saving") : t("common.save")}
            onPress={save}
          />
        </>
      }
    >
      <ErrorBanner text={errorText(createType.error ?? createRes.error)} />
      <Input
        editable={!busy && createdTypeId === null}
        testID="crm-resource-type-name"
        label={t("resources.typeName")}
        placeholder={t("resources.typePlaceholder")}
        value={name}
        onChangeText={setName}
      />
      <Input
        testID="crm-resource-first-name"
        label={t("resources.firstResource")}
        placeholder={t("resources.resourcePlaceholder")}
        value={first}
        onChangeText={setFirst}
      />
      <NumberInput label={t("resources.capacity")} value={cap} onChange={setCap} />
      <Text size={12}>{t("resources.capacityHint")}</Text>
    </Sheet>
  );
}
