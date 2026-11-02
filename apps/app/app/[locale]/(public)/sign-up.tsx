import { useTranslation } from "react-i18next";

import { ComingSoonScreen } from "@/features/coming-soon/ComingSoonScreen";

export default function SignUpScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t("comingSoon.signUp")} />;
}
