import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ChatStep } from "./ChatStory";

const DOTS = ["d1", "d2", "d3"] as const;
const BACK = "‹";
const SEND = "↑";
const OA = "OA";
const GS = "GS";

/**
 * A perspective on phones (ADR-0014 mobile): a full-width, native-looking chat (the client's Zalo chat
 * with the salon, or the owner's assistant "Gu"), one story page per step (tap right = next). The
 * benefit of the step sits on top;
 * GuGu Studio toasts show what the salon's system just did. Not a phone inside the phone. Messages of
 * a new step type in one by one; scrolling back shows earlier steps at once; reduced motion shows all.
 */
export function MobileChat({
  ns,
  kind,
  steps,
  step,
  live,
  reduce,
  viz,
  chapterId,
}: {
  ns: string;
  kind: "client" | "ai";
  steps: readonly ChatStep[];
  /** the step on screen (the story page) */
  step: number;
  /** the chat is on screen (messages type in only then) */
  live: boolean;
  reduce: boolean;
  viz?: (k: string) => ReactNode;
  chapterId: string;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as (k: string, o?: Record<string, unknown>) => string;
  const all = steps.flatMap((s) => s.msgs);
  const upTo = (i: number) => steps.slice(0, i + 1).reduce((n, s) => n + s.msgs.length, 0);
  const target = upTo(step);
  // The furthest message typed so far; going back simply shows fewer.
  const [count, setCount] = useState(0);
  const prevTarget = useRef(target);
  const shown = reduce ? target : Math.min(count, target);
  const nextMsg = all[shown];
  const typing =
    live &&
    !reduce &&
    shown < target &&
    nextMsg !== undefined &&
    nextMsg.from !== "me" &&
    nextMsg.from !== "sys";

  useEffect(() => {
    // Going back: earlier steps are complete at once.
    if (target < prevTarget.current) {
      const id = window.setTimeout(() => {
        setCount(target);
      }, 0);
      prevTarget.current = target;
      return () => {
        window.clearTimeout(id);
      };
    }
    prevTarget.current = target;
    if (!live) return;
    if (reduce) {
      const id = window.setTimeout(() => {
        setCount(target);
      }, 0);
      return () => {
        window.clearTimeout(id);
      };
    }
    if (count >= target) return;
    // a jump of several steps: the earlier ones appear at once, only this step types in
    const floor = upTo(step - 1);
    const id = window.setTimeout(
      () => {
        setCount(Math.max(count + 1, floor));
      },
      count < floor ? 0 : typing ? 900 : 480,
    );
    return () => {
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, reduce, count, target, typing, step]);

  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [shown, typing, reduce]);

  const latest = [...all.slice(0, shown)].reverse().find((m) => m.fx)?.fx ?? null;
  const cur = steps[step] ?? steps[0];
  const top =
    kind === "client" ? (
      <div className="mc-top">
        <span className="back" aria-hidden>
          {BACK}
        </span>
        <i className="mc-ava" aria-hidden>
          {t(`${ns}.avatar`)}
          <em>{OA}</em>
        </i>
        <div className="mc-who">
          <b>{t(`${ns}.who`)}</b>
          <small>{t(`${ns}.whoSub`)}</small>
        </div>
      </div>
    ) : (
      <div className="mc-top">
        <i className="mc-ava" aria-hidden>
          {t(`${ns}.avatar`)}
        </i>
        <div className="mc-who">
          <b>
            {t(`${ns}.who`)}
            <em className="mc-plan">{t(`${ns}.plan`)}</em>
          </b>
          <small>{t(`${ns}.whoSub`)}</small>
        </div>
      </div>
    );

  return (
    <div className="mc-pin">
      <div className="mc-copy">
        <div className="mj-eye" id={chapterId}>
          {t(`${ns}.eyebrow`)}
        </div>
        <div className="mc-stepc">
          {steps.map((g) => (
            <div key={g.k} className="mc-ghost" aria-hidden>
              <span className="n">{t("flow.hud.page", { n: 1, total: steps.length })}</span>
              <b>{t(`${ns}.${g.k}.h`)}</b>
              <p>{t(`${ns}.${g.k}.b`)}</p>
            </div>
          ))}
          {/* re-keyed only for the entrance; the page announcement and the chat log are the live regions */}
          <div className="mc-live" key={cur?.k}>
            <span className="n">{t("flow.hud.page", { n: step + 1, total: steps.length })}</span>
            <b>{t(`${ns}.${cur?.k ?? "s1"}.h`)}</b>
            <p>{t(`${ns}.${cur?.k ?? "s1"}.b`)}</p>
          </div>
        </div>
        <div className="mc-dots" aria-hidden>
          {steps.map((s, i) => (
            <i key={s.k} className={i <= step ? "on" : undefined} />
          ))}
        </div>
        <p className="mc-note">{t(`${ns}.note`)}</p>
      </div>
      <div className="mc-app">
        {top}
        {kind === "client" && latest && live ? (
          <div className="mc-toast" key={latest} role="status">
            <i aria-hidden>{GS}</i>
            <span>
              <small>{t(`${ns}.sys.title`)}</small>
              {t(`${ns}.fx.${latest}`)}
            </span>
          </div>
        ) : null}
        <div className="mc-log" ref={log} role="log" aria-label={t(`${ns}.who`)}>
          {kind === "client" ? <div className="mc-day">{t(`${ns}.day`)}</div> : null}
          {all.slice(0, shown).map((m, i) => (
            <div
              key={`${m.k}-${String(i)}`}
              className={`mc-msg ${m.from}${m.card ? " card" : ""}${m.viz ? " has-viz" : ""}`}
            >
              {kind === "ai" && m.from === "them" ? (
                <span className="mc-gu" aria-hidden>
                  {t(`${ns}.avatar`)}
                </span>
              ) : null}
              <div className="mc-col">
                <div className="mc-bub">
                  <span className="mj-vh">{t(`flow.m.from.${kind}.${m.from}`)}</span>
                  {t(`${ns}.${m.k}`)}
                  {m.viz && viz ? <div className="mc-viz">{viz(m.viz)}</div> : null}
                </div>
                {m.source ? (
                  <span className="mc-src">
                    <i aria-hidden />
                    {t(`${ns}.${m.source}`)}
                  </span>
                ) : null}
                {m.buttons ? (
                  // quick replies: a tap anywhere on them is "next" (never the back zone)
                  <div className="mc-btns" aria-hidden data-advance>
                    {m.buttons.map((b) => (
                      <span key={b}>{t(`${ns}.${b}`)}</span>
                    ))}
                  </div>
                ) : null}
                {m.time ? <span className="mc-time">{t(`${ns}.${m.time}`)}</span> : null}
              </div>
            </div>
          ))}
          {typing ? (
            <div className="mc-msg them">
              {kind === "ai" ? (
                <span className="mc-gu" aria-hidden>
                  {t(`${ns}.avatar`)}
                </span>
              ) : null}
              <div className="mc-col">
                <div className="mc-bub mc-typing" aria-hidden>
                  {DOTS.map((d) => (
                    <i key={d} />
                  ))}
                  {kind === "ai" ? <span>{t(`${ns}.thinking`)}</span> : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="mc-input" aria-hidden>
          <span className="f">{t(`${ns}.input`)}</span>
          <span className="s">{SEND}</span>
        </div>
        {kind === "ai" ? <p className="mc-privacy">{t(`${ns}.privacy`)}</p> : null}
      </div>
    </div>
  );
}
