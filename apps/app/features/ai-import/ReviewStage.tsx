import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Text, useCalm } from "@gugu/design-system";
import type { AiImportExtractResult } from "@gugu/contracts";
import { type ReviewRow, rowProblems, toServiceInput } from "@gugu/domain";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useCategories } from "../salon-crm/data/catalog";
import { useBreakpoint } from "../salon-crm/shell/useBreakpoint";
import { useErrorText } from "../salon-crm/ui/errors";
import { ErrorBanner } from "../salon-crm/ui/form";
import { useConfirm } from "./data";
import { PanelHeader } from "./parts";
import { ReviewRows } from "./ReviewRows";

/** Review table: the owner edits/unticks AI rows, then saves them as services in one go. */
export function ReviewStage({
  result,
  initialRows,
  onDone,
  onStartOver,
}: {
  result: AiImportExtractResult;
  initialRows: ReviewRow[];
  onDone: (created: number) => void;
  onStartOver: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const categories = useCategories();
  const confirm = useConfirm();
  const errorText = useErrorText();
  const [rows, setRows] = useState(initialRows);
  const [showInvalid, setShowInvalid] = useState(false);
  const cats = useMemo(() => categories.data?.items ?? [], [categories.data]);

  const included = rows.filter((r) => r.include);
  const invalid = included.filter((r) => rowProblems(r).length > 0);
  const redacted = result.images.reduce((n, i) => n + i.redactedRegions + i.maskedFaces, 0);
  const cap =
    result.usage.capVnd === "unlimited"
      ? t("aiImport.unlimited")
      : formatVND(result.usage.capVnd, locale);

  const save = () => {
    if (confirm.isPending || included.length === 0) return;
    if (invalid.length) {
      setShowInvalid(true);
      return;
    }
    const slugToId = new Map(cats.map((x) => [x.slug, x.id]));
    confirm.mutate(
      { items: included.map((r) => toServiceInput(r, slugToId)) },
      {
        onSuccess: (res) => {
          onDone(res.created);
        },
      },
    );
  };

  return (
    <CalmCard testID="ai-import-review" style={{ gap: 14 }}>
      <PanelHeader
        title={t("aiImport.reviewTitle")}
        subtitle={
          rows.length
            ? t("aiImport.reviewBody", { count: String(rows.length) })
            : t("aiImport.empty")
        }
      />
      <View style={{ gap: 2 }}>
        {redacted > 0 ? (
          <Text size={12} color={c.muted}>
            {t("aiImport.redactedNote", { count: String(redacted) })}
          </Text>
        ) : null}
        <Text size={12} color={c.muted}>
          {t("aiImport.usage", { used: formatVND(result.usage.usedVnd, locale), cap })}
        </Text>
      </View>
      <ReviewRows
        rows={rows}
        categories={cats}
        wide={bp === "desktop" || bp === "wide"}
        onChange={(key, patch) => {
          setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        }}
      />
      <ErrorBanner
        text={
          showInvalid && invalid.length
            ? t("aiImport.invalidRows", { count: String(invalid.length) })
            : errorText(confirm.error)
        }
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
        <CalmButton variant="ghost" label={t("aiImport.startOver")} onPress={onStartOver} />
        {included.length > 0 ? (
          <CalmButton
            testID="ai-import-save"
            icon="check"
            label={
              confirm.isPending
                ? t("aiImport.saving")
                : t("aiImport.save", { count: String(included.length) })
            }
            onPress={save}
          />
        ) : null}
      </View>
    </CalmCard>
  );
}
