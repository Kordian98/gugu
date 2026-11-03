import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A stepped, scripted chat (web) used by the two extra perspectives of the story: the client's Zalo
 * chat with the salon and the owner's AI assistant. Left: the benefit of the current step; right: the
 * device with the conversation so far. Steps move only by Next/Prev, ← / → (while shown) and horizontal
 * swipes, like the salon story. New messages type in one by one; reduced motion shows them at once.
 * Everything is illustrative copy from i18n; nothing is sent anywhere.
 */
export type ChatMsg = {
  /** me = the person on this device, them = the other side (salon bot / assistant), staff, sys = note */
  from: "me" | "them" | "staff" | "sys";
  k: string;
  /** i18n keys of quick-reply buttons under the message */
  buttons?: readonly string[];
  /** render as a confirmation card */
  card?: boolean;
  /** source chip under an assistant answer */
  source?: string;
};
export type ChatStep = { k: string; msgs: readonly ChatMsg[] };

const ARROW_R = "→";
const ARROW_L = "←";
const DOTS = ["d1", "d2", "d3"] as const;

export function ChatStory({
  ns,
  kind,
  steps,
  active,
  reduce,
  bg,
  onFinish,
  ends,
}: {
  /** i18n prefix, e.g. "views.client" */
  ns: string;
  kind: "phone" | "panel";
  steps: readonly ChatStep[];
  active: boolean;
  reduce: boolean;
  bg: string;
  onFinish: () => void;
  /** buttons on the last step: label key + action */
  ends: readonly { k: string; go: () => void; primary?: boolean }[];
}) {
  const { t: typed } = useTranslation("landing");
  // Keys are built from the script (`${ns}.m3`), so they are plain strings here.
  const t = typed as unknown as (k: string, o?: Record<string, unknown>) => string;
  const [step, setStep] = useState(0);
  const [count, setShown] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;
  const upTo = (i: number) => steps.slice(0, i + 1).reduce((n, s) => n + s.msgs.length, 0);
  const all = steps.flatMap((s) => s.msgs);

  // Reveal the current step's messages one by one (typing dots before the other side's messages).
  const target = upTo(step);
  const shown = reduce ? target : Math.min(count, target);
  const nextMsg = all[shown];
  const typing =
    active &&
    !reduce &&
    shown < target &&
    nextMsg !== undefined &&
    nextMsg.from !== "me" &&
    nextMsg.from !== "sys";
  useEffect(() => {
    if (!active || reduce || shown >= target) return;
    const id = window.setTimeout(
      () => {
        setShown(shown + 1);
      },
      typing ? 900 : 450,
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [active, reduce, shown, target, typing]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [shown, typing, reduce]);

  const go = (d: 1 | -1) => {
    if (d > 0) {
      // A press while messages are still typing completes the step first (one press, one step).
      if (shown < target) {
        setShown(target);
        return;
      }
      if (step >= last) {
        onFinish();
        return;
      }
      setShown(target);
      setStep(step + 1);
    } else if (step > 0) {
      setStep(step - 1);
      setShown(upTo(step - 1));
    }
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  // ← / → while this perspective is shown; one horizontal swipe = one step.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "") || e.altKey || e.metaKey || e.ctrlKey)
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goRef.current(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRef.current(-1);
      }
    };
    const r = root.current;
    let sx = 0;
    let sy = 0;
    let fired = false;
    const ts = (e: TouchEvent) => {
      sx = e.touches[0]?.clientX ?? 0;
      sy = e.touches[0]?.clientY ?? 0;
      fired = false;
    };
    const tm = (e: TouchEvent) => {
      const dx = (e.touches[0]?.clientX ?? sx) - sx;
      const dy = (e.touches[0]?.clientY ?? sy) - sy;
      if (!fired && Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
        fired = true;
        goRef.current(dx < 0 ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    r?.addEventListener("touchstart", ts, { passive: true });
    r?.addEventListener("touchmove", tm, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      r?.removeEventListener("touchstart", ts);
      r?.removeEventListener("touchmove", tm);
    };
  }, [active]);

  const cur = steps[step];
  return (
    <div className={`cs cs-${kind}`} ref={root} inert={!active}>
      <img className="cs-bg" src={bg} alt="" decoding="async" loading="lazy" />
      <div className="cs-veil" />
      <div className="cs-copy">
        <div className="fl-eye">{t(`${ns}.eyebrow`)}</div>
        <h2 className="fl-h">{t(`${ns}.title`)}</h2>
        <div className="cs-step" key={cur?.k}>
          <b>{t(`${ns}.${cur?.k ?? "s1"}.h`)}</b>
          <p>{t(`${ns}.${cur?.k ?? "s1"}.b`)}</p>
        </div>
        <p className="cs-note">{t(`${ns}.note`)}</p>
      </div>
      <div className="cs-device">
        <div className="cs-top">
          <i className="cs-ava" aria-hidden>
            {t(`${ns}.avatar`)}
          </i>
          <div>
            <b>{t(`${ns}.who`)}</b>
            <small>{t(`${ns}.whoSub`)}</small>
          </div>
        </div>
        <div className="cs-log" ref={log} aria-live="polite">
          {all.slice(0, shown).map((m, i) => (
            <div key={`${m.k}-${String(i)}`} className={`cs-msg ${m.from}${m.card ? " card" : ""}`}>
              <div className="cs-bubble">{t(`${ns}.${m.k}`)}</div>
              {m.source ? <span className="cs-src">{t(`${ns}.${m.source}`)}</span> : null}
              {m.buttons ? (
                <div className="cs-btns" aria-hidden>
                  {m.buttons.map((b) => (
                    <span key={b}>{t(`${ns}.${b}`)}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {typing ? (
            <div className="cs-msg them">
              <div className="cs-bubble cs-typing" aria-hidden>
                {DOTS.map((d) => (
                  <i key={d} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="cs-input" aria-hidden>
          <span>{t(`${ns}.input`)}</span>
        </div>
      </div>
      <nav className="cs-nav" aria-label={t(`${ns}.title`)}>
        <span className="cs-bars" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.k} className={i <= step ? "on" : undefined} />
          ))}
        </span>
        <span className="cs-count" aria-hidden>
          {t("flow.hud.page", { n: step + 1, total: steps.length })}
        </span>
        <button
          type="button"
          className="hud-prev"
          aria-label={t("flow.hud.prev")}
          disabled={step === 0}
          onClick={() => {
            go(-1);
          }}
        >
          {ARROW_L}
        </button>
        {step < last || shown < target ? (
          <button
            type="button"
            className="hud-next"
            onClick={() => {
              go(1);
            }}
          >
            {t("flow.hud.next")}
            <i aria-hidden>{ARROW_R}</i>
          </button>
        ) : (
          ends.map((e) => (
            <button
              key={e.k}
              type="button"
              className={e.primary ? "hud-next" : "cs-alt"}
              onClick={e.go}
            >
              {t(e.k)}
            </button>
          ))
        )}
      </nav>
    </div>
  );
}
