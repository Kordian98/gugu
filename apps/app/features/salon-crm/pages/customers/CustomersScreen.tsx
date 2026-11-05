import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import {
  Avatar,
  CalmButton,
  CalmCard,
  Pill,
  space,
  Text,
  typeScale,
  useCalm,
} from "@gugu/design-system";
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
import { QueryError } from "../../ui/QueryError";
import { CustomerSheet } from "./CustomerSheet";

const SEGMENTS = ["all", "new", "returning", "at_risk", "no_shows"] as const;

/** Customers (07 M7.7, §3.5): directory with search, segments, tags; opens the client profile. */
export function CustomersScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <CustomerDirectory key={q ?? ""} initialQuery={q?.slice(0, 60) ?? ""} />;
}

function CustomerDirectory({ initialQuery }: { initialQuery: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const { can } = useSalon();
  const [filter, setFilter] = useState<CustomerFilter>({
    q: initialQuery,
    segment: "all",
    tag: null,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useCustomers(filter);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(filter.q.trim() || filter.tag || filter.segment !== "all");
  const mobile = bp === "mobile";
  const canEdit = can("customers.read");

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}
    >
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
              maxLength={60}
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
          {(list.data?.pages[0]?.tags ?? []).map((tag) => (
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
        {list.data ? (
          <Text size={typeScale.caption} color={c.muted}>
            {t("customers.loadedCount", { shown: items.length, total })}
          </Text>
        ) : null}
        {list.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : list.isError && !list.data ? (
          <QueryError
            onRetry={() => {
              void list.refetch();
            }}
            busy={list.isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            testID="crm-customers-empty"
            icon="users"
            title={t(filtered ? "customers.noResultsTitle" : "pages.customers.emptyTitle")}
            body={t(filtered ? "customers.noResultsBody" : "pages.customers.emptyBody")}
            action={
              filtered ? (
                <CalmButton
                  variant="secondary"
                  label={t("customers.clearFilters")}
                  onPress={() => {
                    setFilter({ q: "", segment: "all", tag: null });
                  }}
                />
              ) : undefined
            }
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
        {list.isError && list.data ? (
          <QueryError
            onRetry={() => {
              void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch());
            }}
            busy={list.isFetching}
          />
        ) : null}
        {list.hasNextPage ? (
          <CalmButton
            testID="crm-customers-more"
            variant="secondary"
            label={t("customers.loadMore")}
            disabled={list.isFetching}
            onPress={() => {
              void list.fetchNextPage();
            }}
          />
        ) : null}
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
        minHeight: space[10] + space[1],
        paddingHorizontal: 12,
        borderRadius: 17,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: on ? c.accentBg : c.line,
        backgroundColor: on ? c.accentSoft : c.surface,
      }}
    >
      <Text role={on ? "uiSemiBold" : "ui"} size={typeScale.body} color={on ? c.accent : c.ink}>
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
      dismissDisabled={create.isPending}
      title={t("customers.add")}
      footer={
        <>
          <CalmButton
            variant="secondary"
            label={t("common.cancel")}
            disabled={create.isPending}
            onPress={() => {
              onClose(null);
            }}
          />
          <CalmButton
            testID="crm-customer-save"
            disabled={!name.trim() || create.isPending}
            label={create.isPending ? t("common.saving") : t("common.save")}
            onPress={() => {
              if (!name.trim() || create.isPending) return;
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
          maxLength={120}
          label={t("calendar.newClientName")}
          value={name}
          onChangeText={setName}
        />
      </Field>
      <Field label={t("calendar.newClientPhone")} hint={t("customers.phoneOptional")}>
        <Input
          testID="crm-customer-phone"
          maxLength={32}
          label={t("calendar.newClientPhone")}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      </Field>
    </Sheet>
  );
}
