import { useTranslation } from "react-i18next";

import { ComingSoonScreen } from "@/features/coming-soon/ComingSoonScreen";

export default function BusinessJoinScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t("comingSoon.businessJoin")} />;
}
