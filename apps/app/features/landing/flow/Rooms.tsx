import { useEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, screenSize, type ScreenName } from "../screens";
import { PHOTO } from "./media";

const SW_STEPS = ["st1", "st2", "st3", "st4"] as const;
const SW_CELLS = Array.from({ length: 15 }, (_, i) => `c${String(i)}`);
const ARROW = "\u2192";
const SW_ROWS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const SPARK = "\u2726";
const CROSS = "\u2715";
const CHECK = "\u2713";
const SEP = " \u00B7 ";
const PIN = "\u25CF";
const BIZ = ["nails", "hair", "barber", "spa", "lash", "brow"] as const;

function useShot() {
  const locale = useLocale();
  return (name: ScreenName) => Asset.fromModule(screen(locale, name)).uri;
}

function useShotSize() {
  const locale = useLocale();
  return (name: ScreenName) => screenSize(locale, name);
}

function Laptop({ src, className }: { src: string; className?: string }) {
  return (
    <div className={className}>
      <div className="lap">
        <img src={src} alt="" decoding="async" loading="lazy" />
      </div>
      <div className="lap-base" />
    </div>
  );
}

/** Treatment-area facts, each with the one CRM screen (and detail) it is about. */
/**
 * `sizes` = the crop's displayed CSS width (the box shows it at full height, cropped sideways: box width ×
 * crop aspect ÷ box aspect, see .tr-shot rules). With the 2× / 3× captures the browser never upscales by
 * more than 1.15× (standing rule), and phones and desktops each download only what they need.
 */
const FACTS = [
  {
    k: "r1",
    shot: "calendarCrop",
    shot2x: "calendarCrop2x",
    label: "shotCal",
    call: "chip",
    cls: "cal",
    sizes: "(max-width: 899px) 210vw, 67vw",
  },
  {
    k: "r2",
    shot: "appointmentsCrop",
    shot2x: "appointmentsCrop2x",
    label: "shotAppt",
    call: "callAppt",
    cls: "appt",
    sizes: "(max-width: 899px) 200vw, 75vw",
  },
  {
    k: "r3",
    shot: "servicesCrop",
    shot2x: "servicesCrop2x",
    label: "shotSvc",
    call: "callSvc",
    cls: "svc",
    sizes: "(max-width: 899px) 196vw, 75vw",
  },
] as const;

/**
 * Treatment area panel (inside the Journey stage): one headline, then three facts revealed one at a time on
 * scroll: a big number, the gain in one line, the old pain small, next to ONE real CRM screen of the
 * seeded demo salon, shown large and cropped to the detail that matters, with a callout.
 */
export function FeaturesPanel() {
  const { t } = useTranslation("landing");
  const shot = useShot();
  const size = useShotSize();
  return (
    <div className="ov ov-f" id="fl-features">
      <div className="t">
        <div className="fl-eye">{t("flow.features.eyebrow")}</div>
        <h2 className="fl-h">{t("flow.features.title")}</h2>
        <div className="tr-dots" aria-hidden>
          {FACTS.map((f) => (
            <span key={f.k}>
              <i className="tr-dot" />
            </span>
          ))}
        </div>
      </div>
      <div className="tr-facts">
        {FACTS.map((f) => (
          <div key={f.k} className="tr-fact">
            <div className="tr-n">{t(`flow.features.${f.k}n`)}</div>
            <h3>{t(`flow.features.${f.k}k`)}</h3>
            <p className="tr-g">{t(`flow.features.${f.k}g`)}</p>
            <p className="tr-p">
              <i aria-hidden>{CROSS}</i>
              <span>
                <em>{t("flow.features.today")}</em>
                {t(`flow.features.${f.k}p`)}
              </span>
            </p>
          </div>
        ))}
      </div>
      <div className="tr-shots">
        {FACTS.map((f) => (
          <figure key={f.k} className={`card tr-shot ${f.cls}`}>
            <figcaption>{t(`flow.features.${f.label}`)}</figcaption>
            <div className="tr-img">
              <img
                src={shot(f.shot)}
                srcSet={`${shot(f.shot2x)} ${String(Math.round((size(f.shot).w * 2) / 3))}w, ${shot(f.shot)} ${String(size(f.shot).w)}w`}
                sizes={f.sizes}
                // intrinsic ratio before load: with lazy loading and `width: auto` the image would
                // otherwise lay out 0 px wide and never load
                width={size(f.shot).w}
                height={size(f.shot).h}
                alt=""
                decoding="async"
                loading="lazy"
              />
            </div>
            <div className="tr-call">
              <i aria-hidden>{PIN}</i>
              {t(`flow.features.${f.call}`)}
            </div>
          </figure>
        ))}
      </div>
      <p className="tr-note">
        {t("flow.features.facts")}
        {SEP}
        {t("flow.features.eg")}
      </p>
    </div>
  );
}

const vnd = (locale: string, n: number) =>
  new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Math.round(n / 1000) * 1000);

/**
 * Interactive, clearly illustrative estimate of revenue recovered from fewer no-shows:
 * bookings/week × 10% no-show × 25% fewer with reminders (BMJ Open 2016) × price × 4.33 weeks.
 * The result counts up smoothly on change (rAF tween on text only).
 */
function EarningsCard() {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const [price, setPrice] = useState(350000);
  const [weekly, setWeekly] = useState(80);
  const out = useRef<HTMLElement>(null);
  const year = useRef<HTMLElement>(null);
  const shown = useRef(0);
  const monthly = weekly * 0.1 * 0.25 * price * 4.33;
  useEffect(() => {
    const from = shown.current;
    const to = monthly;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 700);
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      shown.current = v;
      if (out.current) out.current.textContent = vnd(locale, v);
      if (year.current) year.current.textContent = vnd(locale, v * 12);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [monthly, locale]);
  return (
    <div className="card calc">
      <div className="calc-t">{t("flow.calc.t")}</div>
      <label className="calc-r">
        <span>
          {t("flow.calc.price")}
          <b>{vnd(locale, price)}</b>
        </span>
        <input
          type="range"
          min={100000}
          max={1500000}
          step={50000}
          value={price}
          onChange={(e) => {
            setPrice(Number(e.target.value));
          }}
        />
      </label>
      <label className="calc-r">
        <span>
          {t("flow.calc.weekly")}
          <b>
            {String(weekly)} {t("flow.calc.perWeek")}
          </b>
        </span>
        <input
          type="range"
          min={20}
          max={300}
          step={10}
          value={weekly}
          onChange={(e) => {
            setWeekly(Number(e.target.value));
          }}
        />
      </label>
      <div className="calc-out">
        <b ref={out}>{vnd(locale, 0)}</b>
        <span>{t("flow.calc.out")}</span>
      </div>
      <div className="calc-year">
        <b ref={year}>{vnd(locale, 0)}</b> {t("flow.calc.year")}
      </div>
      <p className="calc-note">
        <a href={t("flow.compose.sourceUrl")} target="_blank" rel="noreferrer">
          {t("flow.calc.note")}
        </a>
      </p>
    </div>
  );
}

function AssistantCard() {
  const { t } = useTranslation("landing");
  return (
    <div className="card">
      <span className="chip">{t("flow.assistant.eyebrow")}</span>
      <div className="bub o">{t("flow.assistant.q")}</div>
      <div className="bub">{t("flow.assistant.a")}</div>
    </div>
  );
}

/** Back office panel: the owner's overview, the earnings estimate (interactive) and the AI assistant (Pro). */
export function OfficePanel() {
  const { t } = useTranslation("landing");
  const shot = useShot();
  return (
    <div className="ov ov-o">
      <Laptop className="of-lap" src={shot("overview")} />
      <div className="t r">
        <div className="fl-eye">{t("flow.office.eyebrow")}</div>
        <h2 className="fl-h">{t("flow.office.title")}</h2>
        <p className="fl-sub of-sub">{t("flow.office.sub")}</p>
      </div>
      <div className="of-side">
        <EarningsCard />
        <AssistantCard />
      </div>
    </div>
  );
}

/**
 * Switching (inside the Journey stage, still in the back office): moving from the old system (a notebook,
 * a spreadsheet, another app; generic, no real brands) into GuGu Studio. The photographed price list
 * becomes the service menu via AI setup (every plan); the other steps are what really happens next
 * (team + hours, clients added with their first booking, start taking bookings). No client import.
 */
export function SwitchPanel() {
  const { t } = useTranslation("landing");
  return (
    <div className="ov ov-s">
      <div className="t">
        <div className="fl-eye">{t("flow.switch.eyebrow")}</div>
        <h2 className="fl-h">{t("flow.switch.title")}</h2>
        <p className="fl-sub sw-sub">{t("flow.switch.sub")}</p>
        <ol className="sw-steps">
          {SW_STEPS.map((k, i) => (
            <li key={k}>
              <b>{String(i + 1)}</b>
              <span>{t(`flow.switch.${k}`)}</span>
              <i className="ok" aria-hidden>
                {CHECK}
              </i>
            </li>
          ))}
        </ol>
      </div>
      <div className="sw-demo">
        <div className="sw-old">
          <div className="sw-o app" aria-hidden>
            <div className="lbl">{t("flow.switch.oApp")}</div>
            <div className="sw-app-ui">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="sw-o xl" aria-hidden>
            <div className="lbl">{t("flow.switch.oXl")}</div>
            <div className="sw-grid">
              {SW_CELLS.map((c) => (
                <span key={c} />
              ))}
            </div>
          </div>
          <div className="sw-o nb plist sw-list">
            <div className="lbl">{t("flow.switch.oNb")}</div>
            <p>{t("flow.switch.list")}</p>
            <span className="sw-scan" />
          </div>
        </div>
        <div className="sw-arrow" aria-hidden>
          {ARROW}
        </div>
        <div className="card sw-win">
          <div className="sw-bar">
            <span aria-hidden />
            <span aria-hidden />
            <span aria-hidden />
            <b>{t("flow.switch.win")}</b>
          </div>
          <div className="sw-ai">
            <div className="sw-ai-h">
              <i aria-hidden>{SPARK}</i>
              {t("flow.switch.ai")}
            </div>
            <div className="sw-prog">
              <span className="sw-fill" />
            </div>
            <div className="sw-status">
              <span className="s1">{t("flow.switch.reading")}</span>
              <span className="s2">{t("flow.switch.done")}</span>
            </div>
          </div>
          <div className="sw-rows">
            {SW_ROWS.map((r) => (
              <div key={r} className="sw-row">
                <div className="sw-sk" aria-hidden>
                  <span />
                  <span />
                </div>
                <div className="sw-val">
                  <div>
                    <b>{t(`flow.switch.n${r}`)}</b>
                    <small>{t(`flow.switch.d${r}`)}</small>
                  </div>
                  <em>{t(`flow.switch.p${r}`)}</em>
                  <span className="sw-tog">
                    <i />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Business types as ONE benefit view (owner): per business, one big illustrative result and the feature
 * that delivers it ("saved X thanks to Y"), over the photoreal scene. No swiping.
 */
export function Businesses() {
  const { t } = useTranslation("landing");
  return (
    <section className="bz" id="fl-biz">
      <div className="bz-head">
        <div className="fl-eye rv">{t("flow.biz.eyebrow")}</div>
        <h2 className="fl-h rv">
          {t("flow.biz.titlePre")}
          <span className="fy-glow">{t("flow.biz.titleGlow")}</span>
          {t("flow.biz.titlePost")}
        </h2>
      </div>
      <div className="bz-grid">
        {BIZ.map((k, i) => (
          <article
            key={k}
            className="bz-tile rv"
            style={{ ["--d" as string]: `${String(i * 70)}ms` }}
          >
            <img src={PHOTO[k]} alt="" loading="lazy" decoding="async" />
            <div className="bz-body">
              <span className="bz-type">{t(`flow.biz.${k}.t`)}</span>
              <b className="bz-num">{t(`flow.biz.${k}.n`)}</b>
              <p className="bz-what">{t(`flow.biz.${k}.w`)}</p>
              <p className="bz-how">
                <i aria-hidden>{SPARK}</i>
                {t(`flow.biz.${k}.f`)}
              </p>
            </div>
          </article>
        ))}
      </div>
      <p className="bz-note">{t("flow.biz.note")}</p>
    </section>
  );
}
