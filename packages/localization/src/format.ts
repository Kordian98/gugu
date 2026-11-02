import type { AppLocale } from "./locales";

/** VND amount (integer đồng) → "300.000đ" (vi) / "300,000đ" (en), as in the homepage reference. */
export function formatVND(amount: number, locale: AppLocale): string {
  const n = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${n}đ`;
}

/** Rating 4.9 → "4.9" (en) / "4,9" (vi). */
export function formatRating(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
