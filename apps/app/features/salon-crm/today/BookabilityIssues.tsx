import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { useOnboarding } from "../data/catalog";
import { useCrmNav } from "../shell/useCrmNav";
import { BookabilityWarning } from "../ui/BookabilityWarning";

/**
 * Today: services nobody can perform and bookable staff without services make the salon silently
 * unbookable (CRM and Zalo bot). Shown at any stage, also after go-live.
 */
export function BookabilityIssues() {
  const { t } = useTranslation("crm");
  const { go } = useCrmNav();
  const issues = useOnboarding().data?.issues;
  if (!issues || (issues.unassignedServices === 0 && issues.staffWithoutServices === 0))
    return null;
  return (
    <View testID="crm-bookability-issues" style={{ gap: 8 }}>
      {issues.unassignedServices > 0 ? (
        <BookabilityWarning
          text={t("today.unassignedServices", { count: issues.unassignedServices })}
          action={t("today.fixServices")}
          onPress={() => {
            go("/business/services");
          }}
        />
      ) : null}
      {issues.staffWithoutServices > 0 ? (
        <BookabilityWarning
          text={t("today.staffWithoutServices", { count: issues.staffWithoutServices })}
          action={t("today.fixTeam")}
          onPress={() => {
            go("/business/team");
          }}
        />
      ) : null}
    </View>
  );
}
