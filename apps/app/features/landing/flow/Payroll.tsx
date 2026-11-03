import { useTranslation } from "react-i18next";

import { formatPercent, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

const ITEMS = ["p1", "p2", "p3", "p4", "p5"] as const;
const CHECK = "✓";
/** Illustrative demo month (labelled as such on screen), VND. */
const MONTH = {
  earned: 38_400_000,
  upcoming: 12_600_000,
  pay: 18_900_000,
  costs: 9_500_000,
} as const;
const STAFF = [
  { k: "s1", base: 6_000_000, commission: 2_350_000 },
  { k: "s2", base: 5_500_000, commission: 3_120_000 },
  { k: "s3", base: 0, commission: 1_930_000 },
] as const;

/**
 * Back office, pay page (payroll merged in 63bedc7, ADR-0016): base pay (monthly / daily / hourly) plus
 * commission % or a fixed amount per service, earned per completed service line, monthly payroll with
 * bonuses / deductions, close + Excel export, the owner's "This month" profit view; staff only see their
 * own earnings. CRM-styled with the CRM's own labels; figures are illustrative estimates before tax.
 */
export function PayrollPanel() {
  const { t } = useTranslation("landing");
  const { t: crm } = useTranslation("crm");
  const locale = useLocale();
  const vnd = (v: number) => formatVND(v, locale);
  const net = MONTH.earned + MONTH.upcoming - MONTH.pay - MONTH.costs;
  const margin = formatPercent(net / (MONTH.earned + MONTH.upcoming), locale);
  const rows = [
    { k: "earned", label: crm("profit.card.earned"), v: MONTH.earned },
    { k: "upcoming", label: crm("profit.card.upcoming"), v: MONTH.upcoming },
    { k: "pay", label: t("flow.payroll.payRow"), v: -MONTH.pay },
    { k: "costs", label: crm("profit.rows.otherCosts"), v: -MONTH.costs },
  ];
  return (
    <div className="ov ov-p">
      <div className="t">
        <div className="fl-eye">{t("flow.payroll.eyebrow")}</div>
        <h2 className="fl-h">{t("flow.payroll.title")}</h2>
        <ul className="in-list">
          {ITEMS.map((k) => (
            <li key={k}>
              <i aria-hidden>{CHECK}</i>
              {t(`flow.payroll.${k}`)}
            </li>
          ))}
        </ul>
        <p className="py-note">{t("flow.payroll.note")}</p>
      </div>
      <div className="card in-win py-win">
        <div className="sw-bar">
          <span aria-hidden />
          <span aria-hidden />
          <span aria-hidden />
          <b>{crm("profit.card.title")}</b>
          <em className="in-eg">{t("flow.insights.eg")}</em>
        </div>
        <div className="py-body">
          <div className="in-block py-month">
            {rows.map((r) => (
              <div key={r.k} className="py-row">
                <span>{r.label}</span>
                <b>{vnd(r.v)}</b>
              </div>
            ))}
            <div className="py-row py-net">
              <span>{crm("profit.rows.net")}</span>
              <b>{vnd(net)}</b>
              <em>{t("flow.payroll.margin", { pct: margin })}</em>
            </div>
          </div>
          <div className="in-block py-table">
            <div className="py-tr py-th">
              <span>{crm("payroll.columns.person")}</span>
              <span>{crm("payroll.columns.base")}</span>
              <span>{crm("payroll.columns.commission")}</span>
              <span>{crm("payroll.columns.total")}</span>
            </div>
            {STAFF.map((s) => (
              <div key={s.k} className="py-tr">
                <span>{t(`flow.payroll.${s.k}`)}</span>
                <span>{s.base ? vnd(s.base) : crm("payroll.baseDetail.none")}</span>
                <span>{vnd(s.commission)}</span>
                <b>{vnd(s.base + s.commission)}</b>
              </div>
            ))}
            <div className="py-actions">
              <span className="py-chip">{crm("payroll.close")}</span>
              <span className="py-chip dark">{crm("payroll.exportXlsx")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
