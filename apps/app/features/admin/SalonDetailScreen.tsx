import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, Pill } from "@gugu/design-system";
import { PLATFORM_ROLE_PERMISSIONS, type PlatformPermission } from "@gugu/domain";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { useAdminSalon } from "./data";
import { dotJoin, fmtDate, fmtDateTime } from "./format";
import { type SheetId, SalonActionSheets } from "./SalonActions";
import {
  AuditCard,
  EntitlementsCard,
  FoundingCard,
  MembersCard,
  SubscriptionCard,
  UsageCard,
} from "./SalonDetailCards";
import { LoadError, Loading, Page, StatusPill } from "./ui";

/** Display-only permission check (the API enforces every write). */
function useCan(): (p: PlatformPermission) => boolean {
  const role = useAuth().user?.platformRole;
  return (p) => (role ? PLATFORM_ROLE_PERMISSIONS[role].has(p) : false);
}

/** Salon detail (M12.6): members, subscription + history, usage, entitlements, overrides, audit. */
export function SalonDetailScreen() {
  const { salonId } = useLocalSearchParams<{ salonId: string }>();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const router = useRouter();
  const q = useAdminSalon(salonId);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const can = useCan();
  const back = (
    <CalmButton
      variant="ghost"
      size="sm"
      icon="chevronLeft"
      label={t("detail.back")}
      onPress={() => {
        router.push(`/${locale}/admin/salons` as never);
      }}
    />
  );
  if (q.isPending)
    return (
      <Page title={t("salons.title")} actions={back}>
        <Loading />
      </Page>
    );
  if (q.isError) {
    return (
      <Page title={t("salons.title")} actions={back}>
        <LoadError onRetry={() => void q.refetch()} />
      </Page>
    );
  }
  const d = q.data;
  const suspended = d.salon.status === "suspended";
  const close = () => {
    setSheet(null);
  };
  return (
    <Page
      testID="admin-salon-detail"
      title={d.salon.name}
      subtitle={dotJoin([
        d.salon.slug,
        t("detail.created", { date: fmtDate(d.salon.createdAt, locale) }),
        t("detail.org", { name: d.salon.organization.name }),
      ])}
      actions={
        <>
          {back}
          {can("platform.salons.suspend") ? (
            <CalmButton
              testID={suspended ? "admin-open-unsuspend" : "admin-open-suspend"}
              variant="secondary"
              size="sm"
              label={suspended ? t("detail.unsuspend") : t("detail.suspend")}
              onPress={() => {
                setSheet(suspended ? "unsuspend" : "suspend");
              }}
            />
          ) : null}
        </>
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <StatusPill label={t(`salonStatus.${d.salon.status}`)} status={d.salon.status} />
        {d.salon.suspendedAt ? (
          <Pill
            label={t("detail.suspendedSince", { date: fmtDateTime(d.salon.suspendedAt, locale) })}
            tone="down"
          />
        ) : null}
        <Pill
          label={t("detail.lastActivity", {
            date: fmtDateTime(d.lastActivityAt, locale) ?? t("common.never"),
          })}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 320, gap: 16 }}>
          <SubscriptionCard d={d} can={can} open={setSheet} />
          <UsageCard d={d} />
          <FoundingCard d={d} can={can} open={setSheet} />
        </View>
        <View style={{ flex: 1, minWidth: 320, gap: 16 }}>
          <EntitlementsCard d={d} can={can} open={setSheet} />
          <MembersCard d={d} />
          <AuditCard d={d} />
        </View>
      </View>
      <SalonActionSheets salon={d} sheet={sheet} onClose={close} />
    </Page>
  );
}
