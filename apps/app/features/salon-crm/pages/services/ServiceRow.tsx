import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, Icon, Text, useCalm } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";
import type { Service, StaffMember } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { Toggle } from "../../ui/form";

export const priceText = (price: number, max: number | null, locale: "vi" | "en") =>
  max !== null && max > price
    ? `${formatVND(price, locale)} – ${formatVND(max, locale)}`
    : formatVND(price, locale);

/** One service in the list (ref crm-02 "Team & Services"): dot, name, duration, price, staff. */
export function ServiceRow({
  service,
  staff,
  canEdit,
  first,
  last,
  onEdit,
  onToggle,
  onMove,
  onDelete,
}: {
  service: Service;
  staff: StaffMember[];
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const name = (locale === "en" && service.name.en) || service.name.vi;
  const people = staff.filter((s) => service.staffIds.includes(s.id));
  const unbookable = service.isActive && !people.some((p) => p.isBookable);
  const extras = [
    t("services.minutes", { count: service.durationMinutes }),
    service.variants.length
      ? t("services.variantsCount", { count: service.variants.length })
      : null,
    service.addOns.length ? t("services.addOnsCount", { count: service.addOns.length }) : null,
  ].filter(Boolean);
  const extrasText = extras.join(" · ");
  return (
    <View
      testID={`crm-service-${service.id}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
        opacity: service.isActive ? 1 : 0.6,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("services.edit", { name })}
        disabled={!canEdit}
        onPress={onEdit}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: service.isActive ? c.accentBg : c.muted,
          }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text role="uiSemiBold" size={15} color={c.ink} numberOfLines={1}>
            {name}
          </Text>
          <Text size={12} color={c.body} numberOfLines={1}>
            {extrasText}
          </Text>
          {unbookable ? (
            <View
              testID={`crm-service-unbookable-${service.id}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Icon name="alert" size={12} color={c.down.text} />
              <Text role="uiMedium" size={12} color={c.down.text} numberOfLines={1}>
                {t("services.notBookable")}
              </Text>
            </View>
          ) : null}
        </View>
        <Text role="uiSemiBold" size={14} color={c.ink}>
          {priceText(service.price, service.priceMax, locale)}
        </Text>
        <View style={{ flexDirection: "row", minWidth: 44, justifyContent: "flex-end" }}>
          {people.slice(0, 3).map((p, i) => (
            <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar name={p.displayName} size={26} />
            </View>
          ))}
        </View>
      </Pressable>
      {canEdit ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Toggle
            value={service.isActive}
            onChange={onToggle}
            label={t(service.isActive ? "services.deactivate" : "services.activate", { name })}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("services.moveUp", { name })}
            disabled={first}
            onPress={() => {
              onMove(-1);
            }}
            style={{ padding: 6, opacity: first ? 0.3 : 1 }}
          >
            <Icon name="arrowUp" size={16} color={c.body} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("services.moveDown", { name })}
            disabled={last}
            onPress={() => {
              onMove(1);
            }}
            style={{ padding: 6, opacity: last ? 0.3 : 1 }}
          >
            <Icon name="arrowDown" size={16} color={c.body} />
          </Pressable>
          <Pressable
            testID={`crm-service-delete-${service.id}`}
            accessibilityRole="button"
            accessibilityLabel={t("services.deleteNamed", { name })}
            onPress={onDelete}
            style={{ padding: 6 }}
          >
            <Icon name="trash" size={16} color={c.body} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
