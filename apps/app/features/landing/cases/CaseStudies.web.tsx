import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { formatNumber, formatPercentPoints, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { ASSUMPTIONS } from "../pricing/model";
import { CASES_CSS } from "./cases.css";
import { CASES, caseEstimate, metricValue, type Case, type Metric } from "./data";
import { CaseMap } from "./CaseMap";
import { Stack } from "./Stack";

type T = (k: string, o?: Record<string, unknown>) => string;

const PREV = "‹";
const NEXT = "›";
const INFO = "i";

function Outcome({ c, m, i }: { c: Case; m: Metric; i: number }) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const locale = useLocale();
  const e = caseEstimate(c);
  const v = metricValue(e, m);
  const value =
    m === "kept"
      ? t("flow.cases.v.kept", { v: formatVND(v, locale) })
      : t("flow.cases.v.hours", { n: formatNumber(v, locale) });
  const key = `flow.cases.${c.k}.o${String(i + 1)}`;
  return (
    <li>
      <span className="n" aria-hidden>
        {`0${String(i + 1)}`}
      </span>
      <p>
        <b>{value}</b> {t(`${key}.s`, { n: formatNumber(e.noShowsAvoided, locale, 1) })}
      </p>
      <span className="f">{t(`${key}.f`)}</span>
    </li>
  );
}

function Story({
  c,
  i,
  active,
  reduce,
  mobile,
}: {
  c: Case;
  i: number;
  active: boolean;
  reduce: boolean;
  mobile: boolean;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const locale = useLocale();
  // manual only: "Trước" first, "Sau" when the visitor asks for it (owner, 2026-11-05)
  const [after, setAfter] = useState(false);
  // desktop: inactive panels; phones: the slides off screen once the snap has settled
  const hidden = !active;
  const assumptions = (
    <p className="cx-assume">
      {t("flow.cases.assume", {
        weekly: formatNumber(c.weekly, locale),
        price: formatVND(c.price, locale),
        staff: formatNumber(c.staff, locale),
        minutes: formatNumber(ASSUMPTIONS.minutesPerBooking, locale),
        noShow: formatPercentPoints(ASSUMPTIONS.noShowRate * 100, locale),
        cut: formatPercentPoints(ASSUMPTIONS.reminderCut * 100, locale),
        commission: formatNumber(ASSUMPTIONS.commissionMinutesPerStaff, locale),
        payroll: formatNumber(ASSUMPTIONS.payrollMinutesPerStaff, locale),
        profit: formatNumber(ASSUMPTIONS.profitTallyMinutes, locale),
      })}
    </p>
  );
  return (
    <article
      id={`cx-${c.k}`}
      className={`cx-story${active ? " on" : ""}`}
      {...(mobile
        ? {
            role: "group",
            "aria-roledescription": t("flow.cases.slide"),
            "aria-label": t("flow.cases.slideLabel", {
              n: i + 1,
              total: CASES.length,
              name: t(`flow.cases.${c.k}.name`),
            }),
          }
        : { role: "tabpanel", "aria-labelledby": `cx-tab-${c.k}` })}
      aria-hidden={hidden}
      // hidden panels and off-screen slides are out of the tab order and the accessibility tree
      {...(hidden ? { inert: true } : {})}
    >
      <div className="cx-text">
        <span className="cx-type">{t(`flow.cases.${c.k}.type`)}</span>
        <h3 className="cx-name">{t(`flow.cases.${c.k}.name`)}</h3>
        <p className="cx-setup">{t(mobile ? `flow.m.cases.${c.k}` : `flow.cases.${c.k}.setup`)}</p>
        {mobile ? null : <CaseMap c={c} after={after} setAfter={setAfter} mobile={mobile} />}
      </div>
      <Stack c={c} active={active} mobile={mobile} reduce={reduce} />
      {mobile ? <CaseMap c={c} after={after} setAfter={setAfter} mobile={mobile} /> : null}
      <ul className="cx-outs">
        {c.outcomes.map((m, k) => (
          <Outcome key={m} c={c} m={m} i={k} />
        ))}
      </ul>
      {mobile ? (
        <details className="cx-assume-details">
          <summary>{t("flow.m.caseAssumptions")}</summary>
          {assumptions}
        </details>
      ) : (
        assumptions
      )}
    </article>
  );
}

/**
 * Case studies (owner, 2026-11-04/05), after pricing: four ILLUSTRATIVE salons (invented names,
 * hypothetical figures, labelled as such; no photos of people presented as customers, no quotes).
 * Each: its old way, its own before → after map (manual), three outcomes naming the feature behind
 * each (numbers from the pricing model's `estimate()`), and a stack of real CRM screens of exactly
 * those features. Desktop: tabs (← → Home End). Phones: a swipe carousel, one story per screen, with
 * pills and a pager. Web only (DOM + CSS); native keeps the business tiles.
 */
export function CaseStudies({ reduce, desktop }: { reduce: boolean; desktop: boolean }) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const mobile = !desktop;
  const [cur, setCur] = useState(0);
  const panels = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Phones: the carousel is as tall as the current story (no gap under a shorter one).
  useLayoutEffect(() => {
    const track = panels.current;
    if (!mobile || !track) return;
    const slide = track.children[cur] as HTMLElement | undefined;
    if (!slide) return;
    const fit = () => {
      track.style.height = `${String(slide.offsetHeight)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(slide);
    return () => {
      ro.disconnect();
    };
  }, [cur, mobile]);
  useLayoutEffect(() => {
    if (!mobile && panels.current) panels.current.style.height = "";
  }, [mobile]);

  // Phones: keep the current story's pill in view after a swipe (horizontal only; never moves the page).
  useEffect(() => {
    const tab = tabs.current[cur];
    const row = tab?.parentElement;
    if (!mobile || !tab || !row) return;
    const left = tab.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + tab.offsetWidth > row.scrollLeft + row.clientWidth)
      row.scrollTo({ left: left - 16, behavior: reduce ? "auto" : "smooth" });
    // a new story starts at its top: if the visitor was further down, bring the pills back on screen
    if (row.getBoundingClientRect().top < 0)
      row.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [cur, mobile, reduce]);
  const slideTo = (i: number) => {
    const n = Math.max(0, Math.min(CASES.length - 1, i));
    setCur(n);
    const track = panels.current;
    if (mobile && track)
      track.scrollTo({ left: n * track.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };
  const onTabKey = (e: KeyboardEvent) => {
    const last = CASES.length - 1;
    const to =
      e.key === "ArrowRight"
        ? (cur + 1) % CASES.length
        : e.key === "ArrowLeft"
          ? (cur + last) % CASES.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    slideTo(to);
    tabs.current[to]?.focus();
  };
  // phones: the carousel position picks the story once a swipe has settled on a snap point
  const raf = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = panels.current;
      if (!el || !mobile) return;
      const w = Math.max(1, el.clientWidth);
      const i = Math.round(el.scrollLeft / w);
      if (Math.abs(el.scrollLeft - i * w) > 2) return;
      if (i !== cur && i >= 0 && i < CASES.length) setCur(i);
    });
  };

  return (
    <section
      className={`cx ${mobile ? "m" : "d"}`}
      id="fl-cases"
      aria-labelledby="cx-h"
      {...(mobile ? { "aria-roledescription": t("flow.cases.carousel") } : {})}
    >
      <style>{CASES_CSS}</style>
      <div className="cx-head">
        <div className="fl-eye">{t("flow.cases.eyebrow")}</div>
        <h2 className="fl-h" id="cx-h">
          {t("flow.cases.titlePre")}
          <span className="cx-glow">{t("flow.cases.titleGlow")}</span>
          {t("flow.cases.titlePost")}
        </h2>
        <p className="cx-sub">{t("flow.cases.sub")}</p>
        <p className="cx-label">
          <i aria-hidden>{INFO}</i>
          {t("flow.cases.label")}
        </p>
      </div>
      <div
        className="cx-tabs"
        {...(mobile
          ? { role: "group", "aria-label": t("flow.cases.tabs") }
          : { role: "tablist", "aria-label": t("flow.cases.tabs"), onKeyDown: onTabKey })}
      >
        {CASES.map((c, i) => (
          <button
            key={c.k}
            ref={(b) => {
              tabs.current[i] = b;
            }}
            type="button"
            className="cx-tab"
            id={`cx-tab-${c.k}`}
            {...(mobile
              ? { "aria-current": i === cur, "aria-controls": `cx-${c.k}` }
              : {
                  role: "tab",
                  "aria-selected": i === cur,
                  "aria-controls": `cx-${c.k}`,
                  tabIndex: i === cur ? 0 : -1,
                })}
            onClick={() => {
              slideTo(i);
            }}
          >
            {t(`flow.cases.${c.k}.name`)}
            <small>{t(`flow.cases.${c.k}.type`)}</small>
          </button>
        ))}
      </div>
      <div className="cx-panels" ref={panels} onScroll={mobile ? onScroll : undefined}>
        {CASES.map((c, i) => (
          <Story key={c.k} c={c} i={i} active={i === cur} reduce={reduce} mobile={mobile} />
        ))}
      </div>
      {mobile ? (
        <div className="cx-pg">
          <button
            type="button"
            aria-label={t("flow.cases.prev")}
            disabled={cur === 0}
            onClick={() => {
              slideTo(cur - 1);
            }}
          >
            {PREV}
          </button>
          <span aria-live="polite">
            {t("flow.cases.counter", { n: cur + 1, total: CASES.length })}
          </span>
          <button
            type="button"
            aria-label={t("flow.cases.next")}
            disabled={cur === CASES.length - 1}
            onClick={() => {
              slideTo(cur + 1);
            }}
          >
            {NEXT}
          </button>
        </div>
      ) : null}
    </section>
  );
}
