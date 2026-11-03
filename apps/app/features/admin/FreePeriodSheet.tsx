import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ActionSheet, DayField } from "./ActionSheet";
import { addDays, startOfDayVn, todayVn } from "./format";

/**
 * X25: move the end of the free Basic year later. Dates are Vietnam calendar days: the picked day
 * is the last free day, so the stored end is the following local midnight. Presets count from the
 * current last free day (or today when it has passed). High risk: needs a step-up.
 */
export function FreePeriodSheet({
  open,
  onClose,
  salonId,
  freeUntil,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
  freeUntil: string | null;
}) {
  const { t } = useTranslation("admin");
  const today = todayVn();
  const [until, setUntil] = useState<string | null>(null);
  const currentLastDay = freeUntil ? todayVn(new Date(Date.parse(freeUntil) - 1)) : null;
  const base = currentLastDay && currentLastDay > today ? currentLastDay : today;
  return (
    <ActionSheet
      testID="admin-extend-free"
      open={open}
      onClose={onClose}
      salonId={salonId}
      highRisk
      title={t("actions.free.title")}
      body={t("actions.free.body")}
      build={(reason) =>
        until
          ? {
              kind: "extendFreePeriod",
              body: { freeUntil: startOfDayVn(addDays(until, 1)), reason },
            }
          : null
      }
    >
      <DayField
        label={t("actions.free.until")}
        hint={t("actions.free.hint")}
        value={until}
        onChange={setUntil}
        today={base}
        max={addDays(base, 365)}
        presets={[
          { label: t("actions.dates.d30"), days: 30 },
          { label: t("actions.dates.d90"), days: 90 },
          { label: t("actions.dates.y1"), days: 365 },
        ]}
      />
    </ActionSheet>
  );
}
