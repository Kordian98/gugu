import { useEffect, useRef } from "react";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, type ScreenName } from "../screens";
import { PHOTO } from "./media";

const FEATURES = ["f1", "f2", "f3", "f4"] as const;
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

/** Treatment area: the calendar and the daily tools, revealed in the room where they are used. */
export function FeaturesOverlay() {
  const { t } = useTranslation("landing");
  const shot = useShot();
  return (
    <>
      <div className="wk-cap">{t("flow.walk.deeper")}</div>
      <div className="wk-scrim" style={{ background: "rgba(253,250,247,.86)" }} />
      <div className="ov">
        <div className="t">
          <div className="fl-eye">{t("flow.features.eyebrow")}</div>
          <h2 className="fl-h">{t("flow.features.title")}</h2>
        </div>
        <Laptop className="ft-lap" src={shot("calendar")} />
        <div className="ft-list">
          {FEATURES.map((k) => (
            <div key={k} className="card ft-i">
              <h3>{t(`flow.features.${k}t`)}</h3>
              <p>{t(`flow.features.${k}b`)}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function FeaturesMobile() {
  const { t } = useTranslation("landing");
  const shot = useShot();
  return (
    <div className="ft-m">
      <div className="fl-eye">{t("flow.features.eyebrow")}</div>
      <h2 className="fl-h">{t("flow.features.title")}</h2>
      <Laptop src={shot("calendar")} />
      <div className="grid">
        {FEATURES.map((k) => (
          <div key={k} className="card">
            <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>{t(`flow.features.${k}t`)}</h3>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>{t(`flow.features.${k}b`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard() {
  const { t } = useTranslation("landing");
  return (
    <div className="card">
      <div className="stat">{t("flow.compose.stat")}</div>
      <p className="stat-l">{t("flow.compose.statLabel")}</p>
      <div className="src">
        <a href={t("flow.compose.sourceUrl")} target="_blank" rel="noreferrer">
          {t("flow.compose.source")}
        </a>
      </div>
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

/** Back office: the owner's overview, the cited no-show stat and the AI assistant (Pro). */
export function OfficeOverlay() {
  const { t } = useTranslation("landing");
  const shot = useShot();
  return (
    <>
      <div className="wk-cap">{t("flow.walk.office")}</div>
      <div className="wk-scrim" style={{ background: "rgba(253,250,247,.86)" }} />
      <div className="ov">
        <Laptop className="of-lap" src={shot("overview")} />
        <div className="t r">
          <div className="fl-eye">{t("flow.office.eyebrow")}</div>
          <h2 className="fl-h">{t("flow.office.title")}</h2>
          <p className="fl-sub" style={{ fontSize: 15 }}>
            {t("flow.office.sub")}
          </p>
        </div>
        <div className="of-side">
          <StatCard />
          <AssistantCard />
        </div>
      </div>
    </>
  );
}

export function OfficeMobile() {
  const { t } = useTranslation("landing");
  const shot = useShot();
  return (
    <div className="ft-m">
      <div className="fl-eye">{t("flow.office.eyebrow")}</div>
      <h2 className="fl-h">{t("flow.office.title")}</h2>
      <p className="fl-sub">{t("flow.office.sub")}</p>
      <Laptop src={shot("overview")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <StatCard />
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
    row.current?.scrollBy({ left: dir * Math.min(580, window.innerWidth * 0.8), behavior: "smooth" });
  };
  return (
    <section className="bz">
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
          <article key={k} className="bz-card rv" style={{ ["--d" as string]: `${String(i * 80)}ms` }}>
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
