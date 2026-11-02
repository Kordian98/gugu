import { useTranslation } from "react-i18next";

import { ApiError } from "@/services/auth/api";

/** problem+json `code` → localized sentence (crm:errors.*), with a generic fallback. */
export function useErrorText(): (e: unknown) => string | null {
  const { t, i18n } = useTranslation("crm");
  return (e) => {
    if (!e) return null;
    const code = e instanceof ApiError ? e.code : "common.internal_error";
    const key = `errors.${code.replace(/\./g, "_")}`;
    return i18n.exists(`crm:${key}`) ? t(key as never) : t("errors.generic");
  };
}
