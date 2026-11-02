import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen } from "../screens";
import { CHAPTERS, ILLUSTRATIVE } from "./chapters";
import { SHOTS, maxCssWidth, shotInfo, type ShotName } from "./shots";
import { STORY_CSS } from "./story.css";
import { SLOTS, buildTimeline } from "./timeline";

gsap.registerPlugin(ScrollTrigger);

const uri = (m: number) => Asset.fromModule(m).uri;
const BUBBLES = [
  { k: "1", l: "2%", t: "4%" },
  { k: "2", l: "60%", t: "10%" },
  { k: "3", l: "6%", t: "38%" },
  { k: "4", l: "64%", t: "44%" },
  { k: "5", l: "18%", t: "70%" },
] as const;
const STAMPS = [
  { k: "double", l: "70%", t: "18%", r: -8 },
  { k: "noShow", l: "4%", t: "56%", r: 6 },
  { k: "forgot", l: "66%", t: "74%", r: -4 },
] as const;
const ROWS = ["1", "2", "3", "4"] as const;
const SEP = " \u00B7 ";
const SHOTS_ORDER = ["entrance", "reception", "rooms"] as const;
const SHOT_LAYOUT: Record<ShotName, { cls: string; top: string; radius: number }> = {
  entrance: { cls: "st-entrance", top: "50%", radius: 0 },
  reception: { cls: "st-reception", top: "56%", radius: 24 },
  rooms: { cls: "st-rooms", top: "55%", radius: 24 },
};

/** Nearest scrolling ancestor (the landing's ScrollView element): pinning uses CSS sticky inside it. */
function scrollParent(el: HTMLElement | null): Element {
  let n = el?.parentElement ?? null;
  while (n) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Shot widths that respect native resolution (≤1.15× pixels at the current devicePixelRatio). */
function useShotWidths() {
  const [dims, setDims] = useState({ vw: 1440, vh: 900, dpr: 2 });
  useEffect(() => {
    const read = () => {
      setDims({ vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio || 1 });
    };
    read();
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
    };
  }, []);
  const fit = (n: ShotName, maxVw: number, maxVh: number) => {
    const s = shotInfo(n);
    return Math.min(
      maxCssWidth(s.w, dims.dpr) / 1.09,
      dims.vw * maxVw,
      (dims.vh * maxVh * s.w) / s.h,
    );
  };
  return {
    entrance: fit("entrance", 1.0, 1.0),
    reception: fit("reception", 0.9, 0.56),
    rooms: fit("rooms", 0.9, 0.6),
  };
}

/**
 * Web story (X22/X23, owner direction: a walk through the salon, pain → gain → switching).
 * The stage is pinned with CSS `position: sticky`; GSAP ScrollTrigger scrubs transform/opacity only.
 */
export function Story() {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const w = useShotWidths();
  useLayoutEffect(() => {
    const el = root.current;
    if (el === null) return;
    const ctx = gsap.context(() => {
      buildTimeline(el, scrollParent(el));
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
  }, [locale, w.entrance]);
  const shot = ({
    n,
    cls,
    width,
    top,
    radius,
  }: {
    n: ShotName;
    cls: string;
    width: number;
    top: string;
    radius: number;
  }) => (
    <img
      className={`st-abs ${cls}`}
      src={uri(SHOTS[n])}
      alt=""
      decoding="async"
      style={{
        width,
        left: `calc(50% - ${String(width / 2)}px)`,
        top,
        transform: "translateY(-50%)",
        borderRadius: radius,
        boxShadow: radius ? "0 30px 80px rgba(42,20,38,.18)" : undefined,
      }}
      data-placeholder={shotInfo(n).placeholder ? "true" : undefined}
    />
  );
  return (
    <div className="st-track" ref={root}>
      <style>{STORY_CSS}</style>
      <div className="st-stage">
        {shot({ n: SHOTS_ORDER[0], ...SHOT_LAYOUT.entrance, width: w.entrance })}
        <div className="st-door l">
          <i />
          <b />
        </div>
        <div className="st-door r">
          <i />
          <b />
        </div>
        <div className="st-veil" />
        {shot({ n: SHOTS_ORDER[1], ...SHOT_LAYOUT.reception, width: w.reception })}
        {shot({ n: SHOTS_ORDER[2], ...SHOT_LAYOUT.rooms, width: w.rooms })}
        <div className="st-fade" />
        <div className="st-heads">
          {CHAPTERS.map((c, i) => (
            <div key={c} className="st-head" data-i={i}>
              <div className="st-eye">{t(`story.${c}.eyebrow`)}</div>
              <h2 className="st-title">{t(`story.${c}.title`)}</h2>
              <p className="st-sub">{t(`story.${c}.sub`)}</p>
              {ILLUSTRATIVE.includes(c) ? (
                <div className="st-note">{t("story.illustrative")}</div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="st-mid">
          {BUBBLES.map((b) => (
            <div key={b.k} className="st-bub" style={{ left: b.l, top: b.t }}>
              {t(`story.pain1.chat${b.k}`)}
              <small>{t(`story.pain1.t${b.k}`)}</small>
            </div>
          ))}
          <div className="st-badge" style={{ left: "44%", top: "-4%" }}>
            {t("story.pain1.unread")}
          </div>
          <div className="st-book">
            <p>{t("story.pain2.note1")}</p>
            <p className="x">{t("story.pain2.note2")}</p>
            <p>{t("story.pain2.note3")}</p>
          </div>
          {STAMPS.map((s) => (
            <div
              key={s.k}
              className="st-stamp"
              style={{ left: s.l, top: s.t, rotate: `${String(s.r)}deg` }}
            >
              {t(`story.pain2.${s.k}`)}
            </div>
          ))}
          <div className="st-laptop">
            <div className="st-screen">
              <div className="st-glass">
                <img
                  className="st-img-cal"
                  src={uri(screen(locale, "timeline"))}
                  alt=""
                  decoding="async"
                />
                <img
                  className="st-img-overview"
                  src={uri(screen(locale, "overview"))}
                  alt=""
                  decoding="async"
                  style={{ opacity: 0 }}
                />
                {SLOTS.map((s, i) => (
                  <div
                    key={i}
                    className="st-slot"
                    style={{
                      left: `${String(s.x * 100)}%`,
                      top: `${String(s.y * 100)}%`,
                      width: `${String(s.w * 100)}%`,
                      height: `${String(s.h * 100)}%`,
                    }}
                  />
                ))}
                <div
                  className="st-slot st-newbook"
                  style={{
                    left: "13%",
                    top: "62%",
                    width: "19%",
                    height: "9%",
                    background: "#2A1426",
                    color: "#fff",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 8,
                  }}
                >
                  {t("story.finale.booked")}
                </div>
              </div>
            </div>
            <div className="st-base" />
          </div>
          <div className="st-card kpi" style={{ left: "-6%", top: "-16%", width: "54%" }}>
            <img src={uri(screen(locale, "kpis"))} alt="" decoding="async" />
          </div>
          <div className="st-card client" style={{ right: "-8%", top: "6%", width: "26%" }}>
            <img src={uri(screen(locale, "upcoming"))} alt="" decoding="async" />
          </div>
          <div className="st-phone">
            <div className="st-pscreen">
              <div className="st-notch" />
              <div className="st-pane rem">
                <div className="st-b o">{t("story.reminders.msg")}</div>
                <div
                  className="st-chip"
                  style={{ alignSelf: "flex-end", background: "#E2F5E6", color: "#2F7A43" }}
                >
                  {t("story.reminders.sent")}
                </div>
              </div>
              <div className="st-pane ai">
                <div className="st-chip" style={{ background: "#2A1426", color: "#fff" }}>
                  {t("story.pro")}
                </div>
                <div className="st-b o">{t("story.assistant.q")}</div>
                <div className="st-b ai">{t("story.assistant.a")}</div>
                <div className="st-chip" style={{ background: "#A98BEB", color: "#fff" }}>
                  {t("story.assistant.draft")}
                </div>
                <div
                  className="st-b ai"
                  style={{
                    fontSize: "0.72em",
                    border: 0,
                    background: "transparent",
                    color: "#7A6A80",
                  }}
                >
                  {t("story.assistant.privacy")}
                </div>
              </div>
              <div className="st-pane fin">
                <div className="st-b">{t("story.finale.ask")}</div>
                <div className="st-b o">{t("story.finale.offer")}</div>
                <div className="st-b">{t("story.finale.reply")}</div>
                <div className="st-b o">{t("story.finale.confirm")}</div>
              </div>
            </div>
          </div>
          <div className="st-sw">
            <div className="st-plist">
              <div className="st-lbl">{t("story.switch.photo")}</div>
              <p>{t("story.switch.list")}</p>
            </div>
            <div className="st-cat">
              <div className="st-lbl">
                {[t("story.switch.catalog"), t("story.switch.recognised")].join(SEP)}
              </div>
              {ROWS.map((r) => (
                <div key={r} className="st-row">
                  {t(`story.switch.s${r}`)}
                  <span>{[t(`story.switch.d${r}`), t(`story.switch.p${r}`)].join(SEP)}</span>
                </div>
              ))}
            </div>
            <div className="st-eff">{t("story.switch.effortless")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
