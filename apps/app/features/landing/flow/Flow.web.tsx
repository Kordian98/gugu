import { useEffect, useLayoutEffect, useRef } from "react";
import { Asset } from "expo-asset";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, type ScreenName } from "../screens";
import { PEOPLE } from "./assets";
import { buildBeforeAfter } from "./beforeAfter";
import { FLOW_CSS } from "./flow.css";

gsap.registerPlugin(ScrollTrigger);
const uri = (m: number) => Asset.fromModule(m).uri;

const PAIN = [
  { k: "c1", img: PEOPLE.receptionist },
  { k: "c2", img: PEOPLE.nails },
  { k: "c3", img: PEOPLE.stylist },
  { k: "c4", img: PEOPLE.customer },
] as const;
const BEFORE = ["b1", "b2", "b3", "b4"] as const;
const AFTER = ["a1", "a2", "a3", "a4", "a5"] as const;
const GALLERY: { k: "g1" | "g2" | "g3" | "g4" | "g5" | "g6"; shot?: ScreenName; img?: number }[] = [
  { k: "g1", shot: "overview" },
  { k: "g2", shot: "timeline" },
  { k: "g3", shot: "upcoming" },
  { k: "g4", shot: "kpis" },
  { k: "g5", shot: "aiSetup" },
  { k: "g6", img: PEOPLE.receptionWide },
];
const ROWS = ["1", "2", "3", "4"] as const;
const SEP = " \u00B7 ";
const CHEV_L = "\u2039";
const CHEV_R = "\u203A";
const ARROW = "\u2192";

function scrollParent(el: HTMLElement | null): Element {
  let n = el?.parentElement ?? null;
  while (n) {
    if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight)
      return n;
    n = n.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * v3 landing flow (web): pain with people → pinned before/after split (CSS sticky + GSAP scrub) → swipe
 * gallery of real CRM captures → dense composition with a cited stat → AI assistant (Pro) → switching.
 */
export function Flow() {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const ba = useRef<HTMLDivElement>(null);
  const saved = useRef<HTMLElement>(null);
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (el === null) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    el.querySelectorAll(".rv").forEach((n) => {
      io.observe(n);
    });
    return () => {
      io.disconnect();
    };
  }, [locale]);

  useLayoutEffect(() => {
    const el = ba.current;
    if (el === null) return;
    const ctx = gsap.context(() => {
      buildBeforeAfter(el, scrollParent(el), saved.current);
    }, el);
    const refresh = () => {
      ScrollTrigger.refresh();
    };
    void document.fonts.ready.then(refresh);
    window.addEventListener("load", refresh);
    return () => {
      window.removeEventListener("load", refresh);
      ctx.revert();
    };
  }, [locale]);

  // Mouse drag for the gallery (touch and trackpad scroll natively).
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
      left: dir * Math.min(600, window.innerWidth * 0.8),
      behavior: "smooth",
    });
  };

  return (
    <div className="fl" ref={root}>
      <style>{FLOW_CSS}</style>

      <section className="fl-sec">
        <div className="fl-eye rv">{t("flow.pain.eyebrow")}</div>
        <h2 className="fl-h rv">{t("flow.pain.title")}</h2>
        <p className="fl-sub rv">{t("flow.pain.sub")}</p>
        <div className="fl-grid4">
          {PAIN.map((p, i) => (
            <article
              key={p.k}
              className="fl-pain rv"
              style={{ ["--d" as string]: `${String(i * 90)}ms` }}
            >
              <img src={uri(p.img)} alt="" loading="lazy" decoding="async" />
              <div>
                <div className="fl-k">{t(`flow.pain.${p.k}.k`)}</div>
                <p className="fl-t">{t(`flow.pain.${p.k}.t`)}</p>
                <div className="fl-p">{t(`flow.pain.${p.k}.p`)}</div>
              </div>
            </article>
          ))}
        </div>
        <div className="fl-note rv">{t("flow.pain.note")}</div>
      </section>

      <div className="ba-track" ref={ba}>
        <div className="ba-stage">
          <div className="ba-head">
            <div className="fl-eye">{t("flow.ba.eyebrow")}</div>
            <h2 className="fl-h">{t("flow.ba.title")}</h2>
          </div>
          <div className="ba-split">
            <div className="ba-col b">
              <span className="ba-tag">{t("flow.ba.before")}</span>
              <ol className="ba-steps">
                {BEFORE.map((k, i) => (
                  <li key={k} className={`bs${String(i + 1)}`}>
                    <b>{String(i + 1)}</b>
                    {t(`flow.ba.${k}`)}
                  </li>
                ))}
              </ol>
              <div className="ba-scene">
                <img className="ph" src={uri(PEOPLE.receptionist)} alt="" decoding="async" />
                <div className="ba-card zalo bc-zalo" style={{ top: "6%" }}>
                  {t("flow.ba.zaloIn")}
                </div>
                <div className="ba-card book bc-book" style={{ top: "30%" }}>
                  {t("flow.ba.notebook")}
                </div>
                <div className="ba-card bc-call" style={{ top: "56%" }}>
                  {t("flow.ba.call")}
                </div>
                <div className="ba-card warn bc-forgot" style={{ top: "76%" }}>
                  {t("flow.ba.forgot")}
                </div>
              </div>
            </div>
            <div className="ba-col a">
              <span className="ba-tag">{t("flow.ba.after")}</span>
              <ol className="ba-steps">
                {AFTER.map((k, i) => (
                  <li key={k} className={`as${String(i + 1)}`}>
                    <b>{String(i + 1)}</b>
                    {t(`flow.ba.${k}`)}
                  </li>
                ))}
              </ol>
              <div className="ba-scene">
                <img className="ph" src={uri(PEOPLE.customer)} alt="" decoding="async" />
                <div className="ba-card zalo ac-zalo" style={{ top: "4%" }}>
                  {t("flow.ba.zaloIn")}
                </div>
                <div className="ba-card ok ac-ok" style={{ top: "22%" }}>
                  {t("flow.ba.booked")}
                </div>
                <div className="ba-card cal ac-cal" style={{ top: "36%", left: "4%", right: "4%" }}>
                  <img src={uri(screen(locale, "timeline"))} alt="" decoding="async" />
                </div>
                <div className="ba-card zalo ac-rem" style={{ top: "68%" }}>
                  {t("flow.ba.remind")}
                  <div>
                    <span className="ba-btn ac-come">{t("flow.ba.come")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="ba-note">
            {t("flow.ba.oa")}
            {SEP}
            {t("flow.ba.note")}
          </div>
          <div className="ba-saved">
            {t("flow.ba.saved")}
            <b ref={saved}>0</b>
            {t("flow.ba.min")}
          </div>
        </div>
      </div>

      <section className="fl-sec" style={{ maxWidth: "none", paddingLeft: 0, paddingRight: 0 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 var(--g)" }}>
          <div className="fl-eye rv">{t("flow.gallery.eyebrow")}</div>
          <h2 className="fl-h rv">{t("flow.gallery.title")}</h2>
        </div>
        <div className="gl-nav">
          <span>{t("flow.gallery.hint")}</span>
          <button
            type="button"
            aria-label={t("flow.gallery.prev")}
            onClick={() => {
              slide(-1);
            }}
          >
            {CHEV_L}
          </button>
          <button
            type="button"
            aria-label={t("flow.gallery.next")}
            onClick={() => {
              slide(1);
            }}
          >
            {CHEV_R}
          </button>
        </div>
        <div className="gl">
          <div className="gl-row" ref={row}>
            {GALLERY.map((g, i) => (
              <article
                key={g.k}
                className="gl-card rv"
                style={{ ["--d" as string]: `${String(i * 70)}ms` }}
              >
                <div className="gl-media">
                  {g.shot ? (
                    <img
                      src={uri(screen(locale, g.shot))}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ) : (
                    <img
                      className="full"
                      src={uri(g.img ?? PEOPLE.receptionWide)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  )}
                </div>
                <div className="gl-txt">
                  <h3>{t(`flow.gallery.${g.k}.t`)}</h3>
                  <p>{t(`flow.gallery.${g.k}.b`)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fl-sec">
        <div className="fl-eye rv">{t("flow.compose.eyebrow")}</div>
        <h2 className="fl-h rv">{t("flow.compose.title")}</h2>
        <p className="fl-sub rv">{t("flow.compose.sub")}</p>
        <div className="cp">
          <div className="cp-lap rv">
            <div className="lap">
              <img src={uri(screen(locale, "overview"))} alt="" loading="lazy" decoding="async" />
            </div>
            <div className="lap-base" />
          </div>
          <div className="cp-side">
            <div className="cp-card rv" style={{ ["--d" as string]: "120ms" }}>
              <div className="stat">{t("flow.compose.stat")}</div>
              <p className="stat-l">{t("flow.compose.statLabel")}</p>
              <div className="src">
                <a href={t("flow.compose.sourceUrl")} target="_blank" rel="noreferrer">
                  {t("flow.compose.source")}
                </a>
              </div>
            </div>
            <div className="rv" style={{ ["--d" as string]: "220ms" }}>
              <div className="ph-mini">
                <div>
                  <div className="bub o">{t("flow.ba.remind")}</div>
                  <div className="bub">{t("flow.ba.come")}</div>
                </div>
              </div>
            </div>
            <div className="cp-card rv" style={{ ["--d" as string]: "320ms" }}>
              <img src={uri(screen(locale, "upcoming"))} alt="" loading="lazy" decoding="async" />
            </div>
          </div>
        </div>
      </section>

      <section className="fl-sec">
        <div className="tc">
          <div>
            <div className="fl-eye rv">{t("flow.assistant.eyebrow")}</div>
            <h2 className="fl-h rv">{t("flow.assistant.title")}</h2>
            <p className="fl-sub rv">{t("flow.assistant.sub")}</p>
          </div>
          <div className="chat rv">
            <span className="chip">{t("features.assistant.badge")}</span>
            <div className="bub o">{t("flow.assistant.q")}</div>
            <div className="bub">{t("flow.assistant.a")}</div>
            <span className="chip" style={{ background: "#A98BEB" }}>
              {t("flow.assistant.draft")}
            </span>
          </div>
        </div>
      </section>

      <section className="fl-sec">
        <div className="fl-eye rv">{t("flow.switch.eyebrow")}</div>
        <h2 className="fl-h rv">{t("flow.switch.title")}</h2>
        <p className="fl-sub rv">{t("flow.switch.sub")}</p>
        <div className="sw">
          <div className="plist rv">
            <div className="lbl">{t("flow.switch.from")}</div>
            <p>{t("story.switch.list")}</p>
          </div>
          <div className="arrow rv" style={{ ["--d" as string]: "150ms" }}>
            {ARROW}
          </div>
          <div className="svc rv" style={{ ["--d" as string]: "250ms" }}>
            <div className="lbl">{t("flow.switch.to")}</div>
            {ROWS.map((r, i) => (
              <div
                key={r}
                className="svc-row rv"
                style={{ ["--d" as string]: `${String(350 + i * 120)}ms` }}
              >
                {t(`story.switch.s${r}`)}
                <span>{[t(`story.switch.d${r}`), t(`story.switch.p${r}`)].join(SEP)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
