import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, CalmCard, Pill, Text, useCalm } from "@gugu/design-system";
import type { CustomerSummary } from "@gugu/contracts";
import { formatDateLong, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useCustomers, useCreateCustomer, type CustomerFilter } from "../../data/customers";
import { useSalon } from "../../data/SalonContext";
import { useWorkspace } from "../../data/useWorkspace";
import { PageHeader } from "../../shell/PageHeader";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, Sheet } from "../../ui/form";
import { CustomerSheet } from "./CustomerSheet";

const SEGMENTS = ["all", "new", "returning", "at_risk", "no_shows"] as const;

/** Customers (07 M7.7, §3.5): directory with search, segments, tags; opens the client profile. */
export function CustomersScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const { can } = useSalon();
  const [filter, setFilter] = useState<CustomerFilter>({ q: "", segment: "all", tag: null });
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useCustomers(filter);
  const items = list.data?.items ?? [];
  const mobile = bp === "mobile";
  const canEdit = can("customers.read");

  return (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}>
      <PageHeader
        title={t("pages.customers.title")}
        subtitle={t("customers.subtitle")}
        workspace={ws}
      />
      <CalmCard style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Input
              testID="crm-customers-search"
              label={t("customers.search")}
              placeholder={t("customers.search")}
              value={filter.q}
              onChangeText={(q) => {
                setFilter((f) => ({ ...f, q }));
              }}
            />
          </View>
          {canEdit ? (
            <CalmButton
              testID="crm-customer-add"
              icon="plus"
              label={t("customers.add")}
              onPress={() => {
                setAdding(true);
              }}
            />
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {SEGMENTS.map((s) => (
            <Chip
              key={s}
              label={t(`customers.segments.${s}`)}
              on={filter.segment === s}
              onPress={() => {
                setFilter((f) => ({ ...f, segment: s }));
              }}
            />
          ))}
          {(list.data?.tags ?? []).map((tag) => (
            <Chip
              key={`tag-${tag}`}
              label={`#${tag}`}
              on={filter.tag === tag}
              onPress={() => {
                setFilter((f) => ({ ...f, tag: f.tag === tag ? null : tag }));
              }}
            />
          ))}
        </ScrollView>
        <Text size={12} color={c.muted}>
          {t("customers.count", { count: list.data?.total ?? 0 })}
        </Text>
        {list.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : items.length === 0 ? (
          <EmptyState
            testID="crm-customers-empty"
            icon="users"
            title={t("pages.customers.emptyTitle")}
            body={t("pages.customers.emptyBody")}
          />
        ) : (
          items.map((cu) => (
            <Row
              key={cu.id}
              cu={cu}
              locale={locale}
              mobile={mobile}
              onPress={() => {
                setOpen(cu.id);
              }}
            />
          ))
        )}
      </CalmCard>
      {open ? (
        <CustomerSheet
          key={open}
          id={open}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {adding ? (
        <AddCustomer
          onClose={(id) => {
            setAdding(false);
            if (id) setOpen(id);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function Row({
  cu,
  locale,
  mobile,
  onPress,
}: {
  cu: CustomerSummary;
  locale: "vi" | "en";
  mobile: boolean;
  onPress: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const last = cu.lastVisitAt
    ? formatDateLong(new Date(cu.lastVisitAt), locale)
    : t("customers.never");
  return (
    <Pressable
      testID={`crm-customer-${cu.id}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flexDirection: mobile ? "column" : "row",
        alignItems: mobile ? "stretch" : "center",
        gap: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1.4 }}>
        <Avatar name={cu.displayName} size={38} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text role="uiSemiBold" size={15} color={c.ink} numberOfLines={1}>
            {cu.displayName}
          </Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {cu.phone ? (
              <Text size={12} color={c.body}>
                {cu.phone}
              </Text>
            ) : null}
            {cu.tags.slice(0, 3).map((tag) => (
              <Pill key={tag} size={10} tone="accent" label={tag} />
            ))}
            {cu.atRisk ? <Pill size={10} tone="brand" label={t("customers.atRisk")} /> : null}
            {cu.noShows > 0 ? (
              <Pill size={10} tone="down" label={t("calendar.noShows", { count: cu.noShows })} />
            ) : null}
          </View>
        </View>
      </View>
      <Text size={13} color={c.body} style={{ flex: 0.8 }}>
        {t("calendar.visits", { count: cu.visits })}
      </Text>
      <Text
        size={13}
        color={c.body}
        style={{ flex: 1.2, textTransform: "capitalize" }}
        numberOfLines={1}
      >
        {cu.nextVisitAt
          ? `${t("customers.next")}: ${formatDateLong(new Date(cu.nextVisitAt), locale)}`
          : `${t("customers.last")}: ${last}`}
      </Text>
      <View style={{ alignItems: mobile ? "flex-start" : "flex-end", gap: 2, flex: 0.8 }}>
        <Text role="uiSemiBold" size={14} color={c.ink}>
          {formatVND(cu.estimatedSpend, locale)}
        </Text>
        <Text size={11} color={c.muted}>
          {t("revenueKind.estimated")}
        </Text>
      </View>
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c } = useCalm();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 17,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: on ? c.accentBg : c.line,
        backgroundColor: on ? c.accentSoft : c.surface,
      }}
    >
      <Text role={on ? "uiSemiBold" : "ui"} size={13} color={on ? c.accent : c.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

function AddCustomer({ onClose }: { onClose: (id: string | null) => void }) {
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const create = useCreateCustomer();
  return (
    <Sheet
      open
      onClose={() => {
        onClose(null);
      }}
      closeLabel={t("common.close")}
      title={t("customers.add")}
      footer={
        <>
          <CalmButton
            variant="secondary"
            label={t("common.cancel")}
            onPress={() => {
              onClose(null);
            }}
          />
          <CalmButton
            testID="crm-customer-save"
            label={create.isPending ? t("common.saving") : t("common.save")}
            onPress={() => {
              if (!name.trim()) return;
              create.mutate(
                { displayName: name.trim(), phone: phone.trim() || null },
                {
                  onSuccess: (r) => {
                    onClose(r.id);
                  },
                },
              );
            }}
          />
        </>
      }
    >
      <ErrorBanner text={errorText(create.error)} />
      <Field label={t("calendar.newClientName")}>
        <Input
          testID="crm-customer-name"
          label={t("calendar.newClientName")}
          value={name}
          onChangeText={setName}
        />
      </Field>
      <Field label={t("calendar.newClientPhone")} hint={t("customers.phoneOptional")}>
        <Input
          testID="crm-customer-phone"
          label={t("calendar.newClientPhone")}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      </Field>
    </Sheet>
  );
}
