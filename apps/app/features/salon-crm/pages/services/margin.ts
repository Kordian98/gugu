import type { TFunction } from "i18next";

import { formatVND } from "@gugu/localization";

/** Gross margin of a price at an internal cost: amount and % of the price (owner/manager only). */
export function margin(price: number, cost: number): { amount: number; pct: number | null } {
  return {
    amount: price - cost,
    pct: price > 0 ? Math.round(((price - cost) / price) * 100) : null,
  };
}

export function marginText(t: TFunction<"crm">, price: number, cost: number, locale: "vi" | "en") {
  const m = margin(price, cost);
  return t("services.margin", {
    amount: formatVND(m.amount, locale),
    pct: m.pct === null ? "—" : String(m.pct),
  });
}
