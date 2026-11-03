import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { ADMIN_SALON_SORTS, type AdminSalonListItem } from "@gugu/contracts";
import { CalmButton, Icon, Pill, Text, useCalm } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { useBreakpoint } from "../salon-crm/shell/useBreakpoint";
import { Select } from "../salon-crm/ui/form";
import { type SalonFilters, useAdminSalons } from "./data";
import { addDays, fmtDate, fmtNumber, todayVn } from "./format";
import { LoadError, Loading, Page, StatusPill } from "./ui";

type FilterId =
  "plan" | "status" | "trialEnds" | "activity" | "zalo" | "founding" | "created" | "bookings";
type Filters = Partial<Record<FilterId, string>> & { sort: (typeof ADMIN_SALON_SORTS)[number] };

const OPTIONS: Record<FilterId, readonly string[]> = {
  plan: ["basic", "pro", "ultra", "trial", "none"],
  status: ["trialing", "active", "past_due", "expired", "cancelled", "none"],
  trialEnds: ["7", "14"],
  activity: ["active7", "active30", "inactive30"],
  zalo: ["true", "false"],
  founding: ["true", "false"],
  created: ["7", "30", "90"],
  bookings: ["1", "10", "100"],
};

const SEARCH_DEBOUNCE_MS = 300;

/** UI filters → `GET /admin/salons` query parameters. */
function toApi(f: Filters, q: string): SalonFilters {
  const activity: Record<string, SalonFilters> = {
    active7: { activeWithinDays: "7" },
    active30: { activeWithinDays: "30" },
    inactive30: { inactiveForDays: "30" },
  };
  return {
    q: q.trim() || undefined,
    plan: f.plan,
    subscriptionStatus: f.status,
    trialEndsWithinDays: f.trialEnds,
    ...(f.activity ? activity[f.activity] : {}),
    zaloConnected: f.zalo,
    foundingPartner: f.founding,
    createdFrom: f.created ? addDays(todayVn(), -Number(f.created)) : undefined,
    minBookings: f.bookings,
    sort: f.sort,
  };
}

/** Salon directory (M12.6): search, filters, sortable list; opens the salon detail. */
export function SalonsScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const router = useRouter();
  const mobile = useBreakpoint() === "mobile";
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  // Search as you type: apply the draft once typing pauses (Enter / blur still apply at once).
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(draft.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [draft]);
  const [filters, setFilters] = useState<Filters>({ sort: "created_desc" });
  // Phones: filters fold away behind one button so the list stays in view.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = (Object.keys(OPTIONS) as FilterId[]).filter((id) => filters[id]).length;
  const list = useAdminSalons(toApi(filters, q));
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const any = t("salons.filter.any");
  const label = (id: FilterId, v: string) => {
    switch (id) {
      case "plan":
        return t(`plan.${v}` as never);
      case "status":
        return t(`subStatus.${v}` as never);
      default:
        return t(`salons.${id}.${v}` as never);
    }
  };
  const filterLabels: Record<FilterId, string> = {
    plan: t("salons.filter.plan"),
    status: t("salons.filter.status"),
    trialEnds: t("salons.filter.trialEnds"),
    activity: t("salons.filter.activity"),
    zalo: t("salons.filter.zalo"),
    founding: t("salons.filter.founding"),
    created: t("salons.filter.created"),
    bookings: t("salons.filter.bookings"),
  };

  return (
    <Page
      testID="admin-salons"
      title={t("salons.title")}
      subtitle={t("salons.subtitle", { count: total })}
    >
      <View style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            height: 42,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
            maxWidth: 520,
          }}
        >
          <Icon name="search" size={16} color={c.muted} />
          <TextInput
            testID="admin-salon-search"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => {
              setQ(draft.trim());
            }}
            onBlur={() => {
              setQ(draft.trim());
            }}
            placeholder={t("salons.search")}
            placeholderTextColor={c.muted}
            accessibilityLabel={t("salons.search")}
            style={{ flex: 1, color: c.ink, fontSize: 14, outlineWidth: 0 }}
          />
        </View>
        {mobile ? (
          <View style={{ flexDirection: "row" }}>
            <CalmButton
              testID="admin-toggle-filters"
              variant="secondary"
              size="sm"
              icon="settings"
              label={t("salons.filtersCount", { count: activeFilters })}
              onPress={() => {
                setFiltersOpen((o) => !o);
              }}
            />
          </View>
        ) : null}
        {mobile && !filtersOpen ? null : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(OPTIONS) as FilterId[]).map((id) => (
              <View key={id} style={{ width: mobile ? "48%" : 180, gap: 4 }}>
                <Text size={12} color={c.muted}>
                  {filterLabels[id]}
                </Text>
                <Select
                  testID={`admin-filter-${id}`}
                  label={filterLabels[id]}
                  placeholder={any}
                  value={filters[id] ?? "any"}
                  options={[
                    { id: "any", label: any },
                    ...OPTIONS[id].map((v) => ({ id: v, label: label(id, v) })),
                  ]}
                  onChange={(v) => {
                    setFilters((f) => ({ ...f, [id]: v === "any" ? undefined : v }));
                  }}
                />
              </View>
            ))}
            <View style={{ width: mobile ? "48%" : 200, gap: 4 }}>
              <Text size={12} color={c.muted}>
                {t("salons.filter.sort")}
              </Text>
              <Select
                testID="admin-sort"
                label={t("salons.filter.sort")}
                placeholder={t("salons.sort.created_desc")}
                value={filters.sort}
                options={ADMIN_SALON_SORTS.map((s) => ({ id: s, label: t(`salons.sort.${s}`) }))}
                onChange={(v) => {
                  setFilters((f) => ({ ...f, sort: v }));
                }}
              />
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row" }}>
          <CalmButton
            variant="ghost"
            size="sm"
            label={t("salons.clear")}
            onPress={() => {
              setFilters({ sort: "created_desc" });
              setDraft("");
              setQ("");
            }}
          />
        </View>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <LoadError onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Text size={14} color={c.muted}>
          {t("salons.empty")}
        </Text>
      ) : (
        <View
          testID="admin-salon-list"
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
            overflow: "hidden",
          }}
        >
          {mobile ? null : <HeaderRow />}
          {items.map((s) => (
            <SalonRow
              key={s.id}
              salon={s}
              mobile={mobile}
              onPress={() => {
                router.push(`/${locale}/admin/salons/${s.id}` as never);
              }}
            />
          ))}
        </View>
      )}
      {list.hasNextPage ? (
        <View style={{ flexDirection: "row" }}>
          <CalmButton
            variant="secondary"
            size="sm"
            label={t("salons.loadMore")}
            onPress={() => void list.fetchNextPage()}
          />
        </View>
      ) : null}
    </Page>
  );
}

const COLS = {
  salon: 3,
  plan: 1.4,
  trialEnds: 1.2,
  paidUntil: 1.2,
  created: 1.1,
  activity: 1.2,
  bookings: 1,
  zalo: 0.9,
};

function HeaderRow() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: c.surfaceMuted,
      }}
    >
      {(Object.keys(COLS) as (keyof typeof COLS)[]).map((k) => (
        <Text key={k} role="uiMedium" size={12} color={c.muted} style={{ flex: COLS[k] }}>
          {t(`salons.col.${k}`)}
        </Text>
      ))}
    </View>
  );
}

function SalonRow({
  salon,
  mobile,
  onPress,
}: {
  salon: AdminSalonListItem;
  mobile: boolean;
  onPress: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const none = t("common.none");
  const date = (iso: string | null) => fmtDate(iso, locale) ?? none;
  const planCell = (
    <View style={{ gap: 4 }}>
      <Text role="uiMedium" size={13} color={c.ink}>
        {t(`plan.${salon.plan ?? "none"}`)}
      </Text>
      <StatusPill
        label={t(`subStatus.${salon.subscriptionStatus}`)}
        status={salon.subscriptionStatus}
      />
    </View>
  );
  const nameCell = (
    <View style={{ gap: 4 }}>
      <Text role="uiSemiBold" size={14} color={c.ink} numberOfLines={1}>
        {salon.name}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Text size={12} color={c.muted}>
          {salon.slug}
        </Text>
        {salon.status === "suspended" ? (
          <StatusPill label={t("salonStatus.suspended")} status="suspended" />
        ) : null}
        {salon.foundingPartner ? (
          <Pill label={t("salons.founding")} tone="brand" size={11} />
        ) : null}
      </View>
    </View>
  );
  const paid = (
    <View style={{ gap: 4 }}>
      <Text size={13} color={c.body}>
        {date(salon.paidUntil)}
      </Text>
      {salon.paidUntilOverdue ? <Pill label={t("salons.overdue")} tone="down" size={11} /> : null}
    </View>
  );
  const bookings = t("salons.bookingsValue", {
    total: fmtNumber(salon.bookingsTotal, locale),
    recent: fmtNumber(salon.bookings30d, locale),
  });
  return (
    <Pressable
      testID={`admin-salon-row-${salon.id}`}
      accessibilityRole="link"
      accessibilityLabel={salon.name}
      onPress={onPress}
      style={(state) => ({
        flexDirection: mobile ? "column" : "row",
        alignItems: mobile ? "stretch" : "center",
        gap: mobile ? 8 : 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: (state as { hovered?: boolean }).hovered ? c.surfaceMuted : "transparent",
      })}
    >
      {mobile ? (
        <>
          {nameCell}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {planCell}
            <Meta label={t("salons.col.trialEnds")} value={date(salon.trialEndsAt)} />
            <Meta label={t("salons.col.activity")} value={date(salon.lastActivityAt)} />
            <Meta label={t("salons.col.bookings")} value={bookings} />
          </View>
        </>
      ) : (
        <>
          <View style={{ flex: COLS.salon }}>{nameCell}</View>
          <View style={{ flex: COLS.plan }}>{planCell}</View>
          <Text size={13} color={c.body} style={{ flex: COLS.trialEnds }}>
            {date(salon.trialEndsAt)}
          </Text>
          <View style={{ flex: COLS.paidUntil }}>{paid}</View>
          <Text size={13} color={c.body} style={{ flex: COLS.created }}>
            {date(salon.createdAt)}
          </Text>
          <Text size={13} color={c.body} style={{ flex: COLS.activity }}>
            {date(salon.lastActivityAt)}
          </Text>
          <Text size={13} color={c.body} style={{ flex: COLS.bookings }}>
            {bookings}
          </Text>
          <Text
            size={13}
            color={salon.zaloConnected ? c.accent : c.muted}
            style={{ flex: COLS.zalo }}
          >
            {salon.zaloConnected ? t("salons.zaloOn") : t("salons.zaloOff")}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 2 }}>
      <Text size={11} color={c.muted}>
        {label}
      </Text>
      <Text size={13} color={c.body}>
        {value}
      </Text>
    </View>
  );
}
