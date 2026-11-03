import { View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  type AdminSalonDetail,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  type LimitValue,
} from "@gugu/contracts";
import { CalmButton, Pill, Text, useCalm } from "@gugu/design-system";
import type { PlatformPermission } from "@gugu/domain";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { dotJoin, fmtDate, fmtDateTime, fmtFreeDay, fmtLimit, fmtNumber, keyId } from "./format";
import type { SheetId } from "./SalonActions";
import { KV, Section, StatusPill } from "./ui";

/** Cards of the salon detail screen (M12.6). Buttons are display-gated; the API enforces. */
export type CardProps = {
  d: AdminSalonDetail;
  can: (p: PlatformPermission) => boolean;
  open: (s: SheetId) => void;
};

export function SubscriptionCard({ d, can, open }: CardProps) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const s = d.subscription;
  const none = t("common.none");
  const write = can("platform.subscriptions.write");
  const onTrial = s?.plan === "trial";
  // X25: the free Basic year can be extended while the salon is on the trial or on Basic.
  const freeable =
    s !== null &&
    (s.plan === "trial" || s.plan === "basic") &&
    (s.status === "trialing" || s.status === "active" || s.status === "past_due");
  return (
    <Section
      testID="admin-subscription"
      title={t("detail.subscription.title")}
      body={t("detail.subscription.manual")}
      actions={
        write ? (
          <>
            <CalmButton
              testID="admin-open-assign"
              size="sm"
              label={t("detail.subscription.assign")}
              onPress={() => {
                open("assignPlan");
              }}
            />
            {!s || onTrial || s.status === "expired" || s.status === "cancelled" ? (
              <CalmButton
                testID="admin-open-trial"
                size="sm"
                variant="secondary"
                label={t("detail.subscription.extendTrial")}
                onPress={() => {
                  open("extendTrial");
                }}
              />
            ) : (
              <CalmButton
                testID="admin-open-paid-until"
                size="sm"
                variant="secondary"
                label={t("detail.subscription.setPaidUntil")}
                onPress={() => {
                  open("setPaidUntil");
                }}
              />
            )}
            {freeable ? (
              <CalmButton
                testID="admin-open-free"
                size="sm"
                variant="secondary"
                label={t("detail.subscription.extendFree")}
                onPress={() => {
                  open("extendFreePeriod");
                }}
              />
            ) : null}
          </>
        ) : null
      }
    >
      {s ? (
        <View>
          <KV label={t("detail.subscription.plan")} value={t(`plan.${s.plan}`)} />
          <KV
            label={t("detail.subscription.status")}
            value={<StatusPill label={t(`subStatus.${s.status}`)} status={s.status} />}
          />
          <KV
            label={t("detail.subscription.interval")}
            value={s.interval ? t(`detail.interval.${s.interval}`) : none}
          />
          <KV
            label={t("detail.subscription.trialEnds")}
            value={fmtDate(s.trialEndsAt, locale) ?? none}
          />
          <KV
            label={t("detail.subscription.freeUntil")}
            value={fmtFreeDay(s.freeUntil, locale) ?? none}
          />
          <KV
            label={t("detail.subscription.paidUntil")}
            value={fmtDate(s.paidUntil, locale) ?? none}
          />
          <KV
            label={t("detail.subscription.invoicing")}
            value={t(`detail.invoicing.${s.invoicingEntity}`)}
          />
        </View>
      ) : (
        <Text size={14} color={c.muted}>
          {t("detail.subscription.none")}
        </Text>
      )}
      <Text role="uiSemiBold" size={13} color={c.ink}>
        {t("detail.subscription.history")}
      </Text>
      {d.subscriptionHistory.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("detail.subscription.historyEmpty")}
        </Text>
      ) : (
        d.subscriptionHistory.slice(0, 10).map((e) => (
          <View
            key={e.id}
            style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.line }}
          >
            <Text size={13} color={c.ink}>
              {t("detail.subscription.historyRow", {
                from: dotJoin([
                  e.fromPlan ? t(`plan.${e.fromPlan}` as never) : null,
                  e.fromStatus ? t(`subStatus.${e.fromStatus}`) : none,
                ]),
                to: dotJoin([
                  e.toPlan ? t(`plan.${e.toPlan}` as never) : null,
                  t(`subStatus.${e.toStatus}`),
                ]),
              })}
            </Text>
            <Text size={12} color={c.muted}>
              {dotJoin([
                fmtDateTime(e.occurredAt, locale),
                e.reason,
                t("detail.subscription.by", { actor: e.actor }),
              ])}
            </Text>
          </View>
        ))
      )}
    </Section>
  );
}

export function UsageCard({ d }: { d: AdminSalonDetail }) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const u = d.usage;
  const unlimited = t("common.unlimited");
  return (
    <Section
      testID="admin-usage"
      title={t("detail.usage.title", { month: u.month })}
      body={t("overview.costNote")}
    >
      <KV
        label={t("detail.usage.ai")}
        value={t("detail.usage.aiValue", {
          used: formatVND(u.aiCostVnd, locale),
          cap: fmtLimit(u.aiCapVnd, locale, unlimited, true),
        })}
      />
      <KV
        label={t("detail.usage.zalo")}
        value={t("detail.usage.zaloValue", {
          sent: fmtNumber(u.zaloTemplateSent, locale),
          limit: fmtLimit(u.zaloTemplateLimit, locale, unlimited),
          cost: formatVND(u.zaloTemplateCostVnd, locale),
        })}
      />
      <KV
        label={t("detail.usage.bookings")}
        value={t("detail.usage.bookingsValue", {
          total: fmtNumber(d.bookingsTotal, locale),
          recent: fmtNumber(d.bookings30d, locale),
        })}
      />
      <KV
        label={t("detail.usage.zaloConnection")}
        value={t(`detail.usage.zaloStatus.${d.zalo.status ?? "none"}` as never)}
      />
    </Section>
  );
}

export function FoundingCard({ d, can, open }: CardProps) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const fp = d.foundingPartner;
  const activeFlag = fp !== null && fp.revokedAt === null;
  return (
    <Section
      testID="admin-founding"
      title={t("detail.founding.title")}
      body={t("detail.founding.body")}
      actions={
        can("platform.founding_partner.write") ? (
          activeFlag ? (
            <CalmButton
              testID="admin-open-founding-revoke"
              size="sm"
              variant="secondary"
              label={t("detail.founding.revoke")}
              onPress={() => {
                open("revokeFounding");
              }}
            />
          ) : (
            <CalmButton
              testID="admin-open-founding-grant"
              size="sm"
              variant="secondary"
              label={t("detail.founding.grant")}
              onPress={() => {
                open("grantFounding");
              }}
            />
          )
        ) : null
      }
    >
      <Text size={14} color={c.ink}>
        {activeFlag
          ? t("detail.founding.yes", {
              date: fmtDate(fp.qualifiedAt, locale),
              source: t(`detail.founding.source.${fp.source}`),
            })
          : t("detail.founding.no")}
      </Text>
      {fp?.revokedAt ? (
        <Text size={12} color={c.muted}>
          {t("detail.founding.revoked", { date: fmtDate(fp.revokedAt, locale) })}
        </Text>
      ) : null}
    </Section>
  );
}

export function valueText(
  key: string,
  v: boolean | LimitValue | null,
  t: (k: string) => string,
  locale: "vi" | "en",
): string {
  if (v === null) return t("common.none");
  if (typeof v === "boolean") return v ? t("detail.entitlements.on") : t("detail.entitlements.off");
  return fmtLimit(v, locale, t("common.unlimited"), key.endsWith("_vnd"));
}

export function EntitlementsCard({ d, can, open }: CardProps) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const tt = (k: string) => t(k as never);
  const keys = Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[];
  return (
    <Section
      testID="admin-entitlements"
      title={t("detail.entitlements.title")}
      body={t("detail.entitlements.body")}
      actions={
        can("platform.entitlements.write") ? (
          <CalmButton
            testID="admin-open-override"
            size="sm"
            label={t("detail.entitlements.add")}
            onPress={() => {
              open("createOverride");
            }}
          />
        ) : null
      }
    >
      <View>
        {keys.map((k) => (
          <KV
            key={k}
            label={tt(`entitlementKey.${keyId(k)}`)}
            value={valueText(k, d.entitlements[k], tt, locale)}
          />
        ))}
      </View>
      <Text role="uiSemiBold" size={13} color={c.ink}>
        {t("detail.entitlements.overrides")}
      </Text>
      {d.overrides.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("detail.entitlements.overridesEmpty")}
        </Text>
      ) : (
        d.overrides.map((o) => (
          <View
            key={o.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 6,
              borderTopWidth: 1,
              borderTopColor: c.line,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={13} color={c.ink}>
                {t("detail.entitlements.overrideRow", {
                  key: o.key in ENTITLEMENT_KEYS ? tt(`entitlementKey.${keyId(o.key)}`) : o.key,
                  value: valueText(o.key, o.value, tt, locale),
                })}
              </Text>
              <Text size={12} color={c.muted}>
                {dotJoin([
                  t("detail.entitlements.until", { date: fmtDate(o.expiresAt, locale) }),
                  o.reason,
                ])}
              </Text>
            </View>
            <Pill
              label={o.active ? t("detail.entitlements.active") : t("detail.entitlements.inactive")}
              tone={o.active ? "up" : "neutral"}
            />
            {o.active && can("platform.entitlements.write") ? (
              <CalmButton
                size="sm"
                variant="ghost"
                label={t("detail.entitlements.revoke")}
                onPress={() => {
                  open({ revokeOverride: o.id });
                }}
              />
            ) : null}
          </View>
        ))
      )}
    </Section>
  );
}

export function MembersCard({ d }: { d: AdminSalonDetail }) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const locale = useLocale();
  return (
    <Section testID="admin-members" title={t("detail.members.title")}>
      {d.members.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("detail.members.empty")}
        </Text>
      ) : (
        d.members.map((m) => (
          <View
            key={m.userId}
            style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.line }}
          >
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Text role="uiMedium" size={14} color={c.ink}>
                {m.displayName ?? m.email ?? t("common.none")}
              </Text>
              <Pill label={t(`detail.members.role.${m.role}` as never)} tone="accent" size={11} />
              {m.status !== "active" ? (
                <Pill label={t(`detail.members.status.${m.status}` as never)} size={11} />
              ) : null}
            </View>
            <Text size={12} color={c.muted}>
              {dotJoin([
                m.email,
                m.lastSeenAt
                  ? t("detail.members.lastSeen", { date: fmtDateTime(m.lastSeenAt, locale) })
                  : null,
              ])}
            </Text>
          </View>
        ))
      )}
    </Section>
  );
}

export function AuditCard({ d }: { d: AdminSalonDetail }) {
  const { c } = useCalm();
  const { t, i18n } = useTranslation("admin");
  const locale = useLocale();
  return (
    <Section testID="admin-audit" title={t("detail.audit.title")}>
      {d.recentAudit.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("detail.audit.empty")}
        </Text>
      ) : (
        d.recentAudit.map((a) => {
          const actionKey = `admin:auditAction.${keyId(a.action)}`;
          const reason = typeof a.metadata["reason"] === "string" ? a.metadata["reason"] : null;
          return (
            <View
              key={a.id}
              style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.line }}
            >
              <Text size={13} color={c.ink}>
                {i18n.exists(actionKey) ? t(actionKey as never) : a.action}
              </Text>
              <Text size={12} color={c.muted}>
                {dotJoin([fmtDateTime(a.createdAt, locale), t(`actor.${a.actorType}` as never)])}
              </Text>
              {reason ? (
                <Text size={12} color={c.body}>
                  {t("detail.audit.reason", { reason })}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </Section>
  );
}
