import { useTranslation } from "react-i18next";

import { Shot } from "./Shot";

const ITEMS = ["p1", "p2", "p3", "p4", "p5"] as const;
const CHECK = "✓";

/**
 * Back office, pay page (payroll merged in 63bedc7, ADR-0016): base pay (monthly / daily / hourly) plus
 * commission % or a fixed amount per service, earned per completed service line, monthly payroll with
 * bonuses / deductions, close + Excel export, the owner's "This month" profit view; staff only see their
 * own earnings — next to a REAL crop of the payroll screen of the seeded demo salon (estimates before tax).
 */
export function PayrollPanel() {
  const { t } = useTranslation("landing");
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
      <Shot
        name="payrollTable"
        name2x="payrollTable2x"
        caption={t("flow.payroll.shot")}
        sizes="(max-width: 899px) 154vw, 52vw"
        className="pay"
      />
    </div>
  );
}
