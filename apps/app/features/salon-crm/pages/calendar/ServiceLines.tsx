import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, checkableA11y, Icon, Text, useCalm } from "@gugu/design-system";
import type { NextService, Service, StaffMember } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

/**
 * Further services of one appointment (06 M6.8, flag `booking.multiService`): each line is a
 * service (+ variant) done right after the previous one, by a chosen staff member or anyone (the
 * engine prefers whoever did the previous line). Availability, the earliest-slot search and the
 * booking itself always use the whole chain; the server revalidates it.
 */

export interface ExtraLine {
  key: string;
  serviceId: string | null;
  variantId: string | null;
  staffId: string | null;
}

let seq = 0;
export const newExtraLine = (): ExtraLine => ({
  key: `line-${String((seq += 1))}`,
  serviceId: null,
  variantId: null,
  staffId: null,
});

/** Complete lines as API `nextServices`, or null while one is still being filled in. */
export function nextServicesOf(lines: ExtraLine[], services: Service[]): NextService[] | null {
  const out: NextService[] = [];
  for (const l of lines) {
    const s = services.find((x) => x.id === l.serviceId);
    if (!s || (s.variants.some((v) => v.isActive) && !l.variantId)) return null;
    out.push({ serviceId: s.id, variantId: l.variantId, addOnIds: [], staffId: l.staffId });
  }
  return out;
}

export function ServiceLines({
  lines,
  services,
  staff,
  max,
  onChange,
}: {
  lines: ExtraLine[];
  services: Service[];
  staff: StaffMember[];
  /** Most extra lines allowed (maxServices − 1). */
  max: number;
  onChange: (lines: ExtraLine[]) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const name = (s: Service) => (locale === "en" && s.name.en) || s.name.vi;
  const patch = (key: string, p: Partial<ExtraLine>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  };
  return (
    <View style={{ gap: 12 }}>
      {lines.map((l, i) => {
        const service = services.find((s) => s.id === l.serviceId) ?? null;
        const people = staff.filter(
          (s) => s.isBookable && (!service || service.staffIds.includes(s.id)),
        );
        return (
          <View
            key={l.key}
            testID="crm-next-service"
            style={{
              gap: 10,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.surface,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text role="uiSemiBold" size={13} color={c.ink}>
                {t("calendar.nextServiceTitle", { n: i + 2 })}
              </Text>
              <Pressable
                testID="crm-next-service-remove"
                accessibilityRole="button"
                accessibilityLabel={t("calendar.removeService")}
                onPress={() => {
                  onChange(lines.filter((x) => x.key !== l.key));
                }}
                hitSlop={8}
              >
                <Icon name="close" size={16} color={c.body} />
              </Pressable>
            </View>
            <Text size={12} color={c.muted}>
              {t("calendar.nextServiceHint")}
            </Text>
            <LineChips
              items={services.map((s) => ({
                id: s.id,
                label: name(s),
                sub: formatVND(s.price, locale),
              }))}
              value={l.serviceId}
              onChange={(id) => {
                const s = services.find((x) => x.id === id);
                patch(l.key, {
                  serviceId: id,
                  variantId: s?.variants.find((v) => v.isActive)?.id ?? null,
                  staffId: l.staffId && s?.staffIds.includes(l.staffId) ? l.staffId : null,
                });
              }}
            />
            {service?.variants.length ? (
              <LineChips
                items={service.variants
                  .filter((v) => v.isActive)
                  .map((v) => ({
                    id: v.id,
                    label: (locale === "en" && v.name.en) || v.name.vi,
                    sub: v.price !== null ? formatVND(v.price, locale) : undefined,
                  }))}
                value={l.variantId}
                onChange={(id) => {
                  patch(l.key, { variantId: id });
                }}
              />
            ) : null}
            {service ? (
              <LineChips
                items={[
                  { id: "any", label: t("calendar.anyStaff") },
                  ...people.map((s) => ({ id: s.id, label: s.displayName })),
                ]}
                value={l.staffId ?? "any"}
                onChange={(id) => {
                  patch(l.key, { staffId: id === "any" ? null : id });
                }}
              />
            ) : null}
          </View>
        );
      })}
      {lines.length < max ? (
        <View style={{ flexDirection: "row" }}>
          <CalmButton
            testID="crm-add-service"
            size="sm"
            variant="secondary"
            icon="plus"
            label={t("calendar.addService")}
            onPress={() => {
              onChange([...lines, newExtraLine()]);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function LineChips({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; sub?: string | undefined }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { c } = useCalm();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((i) => {
        const on = i.id === value;
        return (
          <Pressable
            key={i.id}
            testID="crm-next-chip"
            {...checkableA11y("radio", on)}
            onPress={() => {
              onChange(i.id);
            }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: on ? c.accentBg : c.line,
              backgroundColor: on ? c.accentSoft : c.surface,
            }}
          >
            <Text role={on ? "uiSemiBold" : "ui"} size={13} color={on ? c.accent : c.ink}>
              {i.label}
            </Text>
            {i.sub ? (
              <Text size={11} color={c.muted}>
                {i.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
