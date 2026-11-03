import { useEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, type ScreenName } from "../screens";
import { PHOTO } from "./media";

const FEATURES = ["f1", "f5", "f2", "f3", "f4", "f6", "f7", "f8"] as const;
const PIN = "\u25CF";
const BIZ = ["nails", "hair", "barber", "spa", "lash", "brow"] as const;
const CHEV_L = "‹";
const CHEV_R = "›";

function useShot() {
  const locale = useLocale();
  return (name: ScreenName) => Asset.fromModule(screen(locale, name)).uri;
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

/** Treatment area panel (inside the Journey stage): the calendar and daily tools of this room. */
export function FeaturesPanel() {
  const { t } = useTranslation("landing");
  const shot = useShot();
  return (
    <div className="ov ov-f" id="fl-features">
      <div className="t">
        <div className="fl-eye">{t("flow.features.eyebrow")}</div>
        <h2 className="fl-h">{t("flow.features.title")}</h2>
      </div>
      <div className="ft-lap">
        <div className="lap">
          <img src={shot("calendar")} alt="" decoding="async" loading="lazy" />
        </div>
        <div className="lap-base" />
        <div className="ft-chip">
          <i>{PIN}</i>
          {t("flow.features.chip")}
        </div>
      </div>
      <div className="ft-list">
        {FEATURES.map((k) => (
          <div key={k} className="card ft-i">
            <h3>{t(`flow.features.${k}t`)}</h3>
            <p>{t(`flow.features.${k}b`)}</p>
          </div>
        ))}
      </div>
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

/** Business types: a horizontal swipe through photoreal scenes, each with the matching CRM detail. */
export function Businesses() {
  const { t } = useTranslation("landing");
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = row.current;
    if (r === null) return;
    let x0 = 0;
    let s0 = 0;
    let down = false;
    const dn = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      down = true;
      x0 = e.clientX;
      s0 = r.scrollLeft;
      r.classList.add("drag");
    };
    const mv = (e: PointerEvent) => {
      if (down) r.scrollLeft = s0 - (e.clientX - x0);
    };
    const up = () => {
      down = false;
      r.classList.remove("drag");
    };
    r.addEventListener("pointerdown", dn);
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => {
      r.removeEventListener("pointerdown", dn);
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  const slide = (dir: number) => {
    row.current?.scrollBy({
      left: dir * Math.min(580, window.innerWidth * 0.8),
      behavior: "smooth",
    });
  };
  return (
    <section className="bz" id="fl-biz">
      <div className="bz-head">
        <div>
          <div className="fl-eye rv">{t("flow.biz.eyebrow")}</div>
          <h2 className="fl-h rv">{t("flow.biz.title")}</h2>
        </div>
        <div className="bz-nav">
          <span>{t("flow.biz.hint")}</span>
          <button
            type="button"
            aria-label={t("flow.biz.prev")}
            onClick={() => {
              slide(-1);
            }}
          >
            {CHEV_L}
          </button>
          <button
            type="button"
            aria-label={t("flow.biz.next")}
            onClick={() => {
              slide(1);
            }}
          >
            {CHEV_R}
          </button>
        </div>
      </div>
      <div className="bz-row" ref={row}>
        {BIZ.map((k, i) => (
          <article
            key={k}
            className="bz-card rv"
            style={{ ["--d" as string]: `${String(i * 80)}ms` }}
          >
            <img src={PHOTO[k]} alt="" loading="lazy" decoding="async" draggable={false} />
            <div className="bz-chip">
              <i />
              {t(`flow.biz.${k}.c`)}
            </div>
            <div className="bz-txt">
              <h3>{t(`flow.biz.${k}.t`)}</h3>
              <p>{t(`flow.biz.${k}.b`)}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="bz-note">{t("flow.biz.note")}</div>
    </section>
  );
}
