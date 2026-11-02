import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type { CategoryItem } from "@gugu/contracts";
import { type ReviewRow, rowProblems } from "@gugu/domain";

import { useLocale } from "@/services/i18n/useLocale";

import { Field, Input, MoneyInput, NumberInput, Select } from "../salon-crm/ui/form";

/**
 * Review table of the AI import: one editable row per suggested service. Desktop shows columns,
 * phones a stacked card per row. Problems (missing price/duration) are outlined, never colour only.
 */
export function ReviewRows({
  rows,
  categories,
  wide,
  onChange,
}: {
  rows: ReviewRow[];
  categories: CategoryItem[];
  wide: boolean;
  onChange: (key: string, patch: Partial<ReviewRow>) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  return (
    <View style={{ gap: wide ? 6 : 12 }}>
      {wide ? (
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 10 }}>
          <View style={{ width: 28 }} />
          {[
            [t("services.nameVi"), 2],
            [t("services.nameEn"), 2],
            [t("services.category"), 1.4],
            [t("services.price"), 1.1],
            [t("services.priceMax"), 1.1],
            [t("services.duration"), 0.9],
          ].map(([label, flex]) => (
            <Text
              key={String(label)}
              role="uiMedium"
              size={12}
              color={c.muted}
              style={{ flex: Number(flex) }}
            >
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          categories={categories}
          wide={wide}
          onChange={(patch) => {
            onChange(row.key, patch);
          }}
        />
      ))}
    </View>
  );
}

function Row({
  row,
  categories,
  wide,
  onChange,
}: {
  row: ReviewRow;
  categories: CategoryItem[];
  wide: boolean;
  onChange: (patch: Partial<ReviewRow>) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const problems = rowProblems(row);
  const label = row.nameVi || t("services.newTitle");
  const options = categories.map((cat) => ({
    id: cat.slug,
    label: cat.name[locale] || cat.name.vi,
  }));

  const check = (
    <Pressable
      testID={`ai-import-include-${row.key}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: row.include }}
      accessibilityLabel={t("aiImport.include", { name: label })}
      onPress={() => {
        onChange({ include: !row.include });
      }}
      style={{
        width: 24,
        height: 24,
        marginTop: wide ? 9 : 0,
        borderRadius: 7,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: row.include ? c.accentBg : c.surface,
        borderWidth: row.include ? 0 : 1,
        borderColor: c.line,
      }}
    >
      {row.include ? <Icon name="check" size={14} color={c.onAccent} strokeWidth={2.6} /> : null}
    </Pressable>
  );
  const fields = {
    nameVi: (
      <Input
        label={t("services.nameVi")}
        value={row.nameVi}
        invalid={row.include && problems.includes("name")}
        onChangeText={(v) => {
          onChange({ nameVi: v });
        }}
      />
    ),
    nameEn: (
      <Input
        label={t("services.nameEn")}
        value={row.nameEn}
        onChangeText={(v) => {
          onChange({ nameEn: v });
        }}
      />
    ),
    category: (
      <Select
        label={t("services.category")}
        placeholder={t("services.categoryPlaceholder")}
        value={row.category}
        options={options}
        onChange={(v) => {
          onChange({ category: v });
        }}
      />
    ),
    price: (
      <MoneyInput
        label={t("services.price")}
        value={row.price}
        onChange={(v) => {
          onChange({ price: v });
        }}
      />
    ),
    priceMax: (
      <MoneyInput
        label={t("services.priceMax")}
        value={row.priceMax}
        onChange={(v) => {
          onChange({ priceMax: v });
        }}
      />
    ),
    duration: (
      <NumberInput
        label={t("services.duration")}
        width={wide ? undefined : 96}
        value={row.durationMinutes}
        onChange={(v) => {
          onChange({ durationMinutes: v });
        }}
      />
    ),
  };
  const meta = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Text size={12} color={c.muted}>
        {t("aiImport.fromImage", { index: String(row.sourceImage) })}
      </Text>
      {row.variants.length + row.addOns.length > 0 ? (
        <Text size={12} color={c.muted}>
          {t("aiImport.variantsAddOns", {
            variants: String(row.variants.length),
            addOns: String(row.addOns.length),
          })}
        </Text>
      ) : null}
      {row.lowConfidence ? <Pill label={t("aiImport.lowConfidence")} tone="accent" /> : null}
      {row.include && problems.includes("duration") ? (
        <Text size={12} color={c.attention}>
          {t("aiImport.durationNeeded")}
        </Text>
      ) : null}
    </View>
  );

  const box = {
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: row.include && problems.length ? c.attention : c.line,
    backgroundColor: row.include ? c.surface : c.surfaceMuted,
    opacity: row.include ? 1 : 0.7,
  } as const;

  if (wide) {
    return (
      <View testID={`ai-import-row-${row.key}`} style={[box, { gap: 6 }]}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          {check}
          <View style={{ flex: 2 }}>{fields.nameVi}</View>
          <View style={{ flex: 2 }}>{fields.nameEn}</View>
          <View style={{ flex: 1.4 }}>{fields.category}</View>
          <View style={{ flex: 1.1 }}>{fields.price}</View>
          <View style={{ flex: 1.1 }}>{fields.priceMax}</View>
          <View style={{ flex: 0.9 }}>{fields.duration}</View>
        </View>
        <View style={{ paddingLeft: 38 }}>{meta}</View>
      </View>
    );
  }
  return (
    <View testID={`ai-import-row-${row.key}`} style={[box, { gap: 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {check}
        <View style={{ flex: 1 }}>{fields.nameVi}</View>
      </View>
      {fields.nameEn}
      {fields.category}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label={t("services.price")} flex={1}>
          {fields.price}
        </Field>
        <Field label={t("services.priceMax")} flex={1}>
          {fields.priceMax}
        </Field>
      </View>
      <Field label={t("services.duration")}>{fields.duration}</Field>
      {meta}
    </View>
  );
}
