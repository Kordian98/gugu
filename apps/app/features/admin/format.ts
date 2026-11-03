import type { LimitValue } from "@gugu/contracts";
import { type AppLocale, formatVND } from "@gugu/localization";

const VN_TZ = "Asia/Ho_Chi_Minh";
const tag = (l: AppLocale) => (l === "vi" ? "vi-VN" : "en-US");

/** "3 Nov 2026" in Vietnam time (admin dates are calendar days for salons in Vietnam). */
export function fmtDate(iso: string | null, locale: AppLocale): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: VN_TZ,
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null, locale: AppLocale): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: VN_TZ,
  }).format(new Date(iso));
}

export function fmtNumber(n: number, locale: AppLocale): string {
  return new Intl.NumberFormat(tag(locale)).format(n);
}

/** VND amount or limit; `unlimitedLabel` for "unlimited". */
export function fmtLimit(
  v: LimitValue,
  locale: AppLocale,
  unlimitedLabel: string,
  money = false,
): string {
  if (v === "unlimited") return unlimitedLabel;
  return money ? formatVND(v, locale) : fmtNumber(v, locale);
}

/** Today's calendar day (`YYYY-MM-DD`) in Vietnam. */
export function todayVn(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
}

export function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** End of a Vietnam calendar day as a UTC instant: "paid until 31 Dec" covers that whole day. */
export function endOfDayVn(ymd: string): string {
  return new Date(`${ymd}T23:59:59+07:00`).toISOString();
}

/**
 * Last free day of the free Basic year (X25): `freeUntil` is an exclusive local midnight, so the
 * day shown is the one just before it.
 */
export function fmtFreeDay(iso: string | null, locale: AppLocale): string | null {
  return iso ? fmtDate(new Date(Date.parse(iso) - 1).toISOString(), locale) : null;
}

/** Start (00:00) of a Vietnam calendar day as a UTC instant. */
export function startOfDayVn(ymd: string): string {
  return new Date(`${ymd}T00:00:00+07:00`).toISOString();
}

/** `YYYY-MM` in Vietnam time, shifted by `deltaMonths`. */
export function monthVn(deltaMonths = 0, now = new Date()): string {
  const [y, m] = todayVn(now).split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** i18n key segment for ids that contain dots (entitlement keys, audit actions). */
export const keyId = (id: string) => id.replace(/\./g, "_");

const SEP = " · ";
/** Joins the non-empty parts of a meta line ("3 Nov 2026 · reason · by …"). */
export function dotJoin(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(SEP);
}
