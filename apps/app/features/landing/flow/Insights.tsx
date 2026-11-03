import { useTranslation } from "react-i18next";

import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

const ITEMS = ["i1", "i2", "i3", "i4", "i5"] as const;
/** Illustrative demo figures (labelled as such on screen); formatted per locale. */
const KPIS = [
  { m: "appointments_count", v: 182, pct: false },
  { m: "customers_returning", v: 0.64, pct: true },
  { m: "no_show_rate", v: 0.04, pct: true },
] as const;
const REVENUE = { estimated: 48_600_000, recorded: 45_200_000 } as const;
const FUNNEL = [
  { k: "f1", v: 120 },
  { k: "f2", v: 58 },
  { k: "f3", v: 41 },
] as const;
const MARGINS = [
  { k: "s1", v: 0.62 },
  { k: "s2", v: 0.55 },
  { k: "s3", v: 0.48 },
] as const;
const CHECK = "✓";
const tag = (locale: string) => (locale === "vi" ? "vi-VN" : "en-US");

/**
 * Back office, second page: Insights (exists in the CRM today): key metrics, estimated vs recorded
 * revenue, gross margin per service from execution cost, upcoming appointments, the Zalo funnel. The
 * window is styled like the CRM with the CRM's own metric names; figures are illustrative.
 */
export function InsightsPanel() {
  const { t } = useTranslation("landing");
  const { t: crm } = useTranslation("crm");
  const locale = useLocale();
  const num = (v: number) => new Intl.NumberFormat(tag(locale)).format(v);
  const pct = (v: number) =>
    new Intl.NumberFormat(tag(locale), { style: "percent", maximumFractionDigits: 0 }).format(v);
  return (
    <div className="ov ov-i">
      <div className="t">
        <div className="fl-eye">{t("flow.insights.eyebrow")}</div>
        <h2 className="fl-h">{t("flow.insights.title")}</h2>
        <p className="fl-sub in-sub">{t("flow.insights.sub")}</p>
        <ul className="in-list">
          {ITEMS.map((k) => (
            <li key={k}>
              <i aria-hidden>{CHECK}</i>
              {t(`flow.insights.${k}`)}
            </li>
          ))}
        </ul>
      </div>
      <div className="card in-win">
        <div className="sw-bar">
          <span />
          <span />
          <span />
          <b>{t("flow.insights.win")}</b>
          <em className="in-eg">{t("flow.insights.eg")}</em>
        </div>
        <div className="in-body">
          <div className="in-kpis">
            {KPIS.map((k) => (
              <div key={k.m} className="in-kpi">
                <small>{crm(`insights.metrics.${k.m}`)}</small>
                <b>{k.pct ? pct(k.v) : num(k.v)}</b>
              </div>
            ))}
          </div>
          <div className="in-block in-rev">
            <div className="in-bh">{crm("insights.metrics.revenue_estimated")}</div>
            <div className="in-bar">
              <span className="in-fill a" style={{ ["--w" as string]: "1" }} />
              <em>{formatVND(REVENUE.estimated, locale)}</em>
            </div>
            <div className="in-bh sm">{crm("insights.metrics.revenue_offline_recorded")}</div>
            <div className="in-bar">
              <span
                className="in-fill b"
                style={{ ["--w" as string]: String(REVENUE.recorded / REVENUE.estimated) }}
              />
              <em>{formatVND(REVENUE.recorded, locale)}</em>
            </div>
          </div>
          <div className="in-block in-mg">
            <div className="in-bh">{t("flow.insights.margin")}</div>
            {MARGINS.map((m) => (
              <div key={m.k} className="in-row">
                <span>{t(`flow.insights.${m.k}`)}</span>
                <span className="in-bar sm">
                  <span className="in-fill a" style={{ ["--w" as string]: String(m.v) }} />
                </span>
                <b>{pct(m.v)}</b>
              </div>
            ))}
          </div>
          <div className="in-block in-zalo">
            <div className="in-bh">{t("flow.insights.funnel")}</div>
            <div className="in-fun">
              {FUNNEL.map((f, i) => (
                <div key={f.k} className="in-step">
                  {i > 0 ? <i aria-hidden /> : null}
                  <div>
                    <b>{num(f.v)}</b>
                    <small>{t(`flow.insights.${f.k}`)}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
