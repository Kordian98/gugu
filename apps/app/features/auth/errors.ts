import type { TFunction } from "i18next";

import { ApiError } from "@/services/auth/api";

/** Maps API problem codes to `auth:errors.*` messages. */
export function authErrorMessage(t: TFunction<"auth">, e: unknown): string {
  const code = e instanceof ApiError ? e.code : null;
  if (code === "auth.too_many_attempts" || code === "common.rate_limited") {
    return t("errors.tooManyAttempts");
  }
  if (code === "auth.invalid_or_expired_link") return t("errors.wrongCode");
  return t("errors.generic");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
