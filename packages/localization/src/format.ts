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

/** Salon timezone default (master prompt §12). Times are stored in UTC and shown in the salon's zone. */
export const DEFAULT_SALON_TIMEZONE = "Asia/Ho_Chi_Minh";

const tag = (locale: AppLocale) => (locale === "vi" ? "vi-VN" : "en-US");

/** "Thứ Ba, 14 tháng 10, 2026" / "Tuesday, October 14, 2026" in the salon's timezone. */
export function formatDateLong(
  date: Date,
  locale: AppLocale,
  timeZone = DEFAULT_SALON_TIMEZONE,
): string {
  return new Intl.DateTimeFormat(tag(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
}

/** "14:30" (vi) / "2:30 PM" (en) in the salon's timezone. */
export function formatTime(
  date: Date,
  locale: AppLocale,
  timeZone = DEFAULT_SALON_TIMEZONE,
): string {
  return new Intl.DateTimeFormat(tag(locale), {
    hour: "numeric",
    minute: "2-digit",
    hour12: locale === "en",
    timeZone,
  }).format(date);
}

/** "3/12 14:30" (vi) / "Dec 3, 2:30 PM" (en) in the salon's timezone — compact logs and lists. */
export function formatDateTimeShort(
  date: Date,
  locale: AppLocale,
  timeZone = DEFAULT_SALON_TIMEZONE,
): string {
  const day = new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: locale === "vi" ? "numeric" : "short",
    timeZone,
  }).format(date);
  return locale === "vi"
    ? `${day} ${formatTime(date, locale, timeZone)}`
    : `${day}, ${formatTime(date, locale, timeZone)}`;
}

/** Hour of day (0–23) in the salon's timezone. */
export function hourInZone(date: Date, timeZone = DEFAULT_SALON_TIMEZONE): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  return Number(h);
}
