import { useLayoutEffect, useRef, useState } from "react";

import { HAND_HEART_PATH, color, font } from "@gugu/design-system";

const CSS = `
.hw text{font-family:${font.script};font-size:33px;fill:${color.script};fill-opacity:0;stroke:${color.script};stroke-width:.9;stroke-linejoin:round;stroke-dasharray:1400;stroke-dashoffset:1400;
animation:hw-stroke 1.25s cubic-bezier(.45,0,.3,1) forwards,hw-fill .55s ease forwards;animation-delay:calc(var(--i)*1.05s + .5s),calc(var(--i)*1.05s + 1.25s)}
.hw .hw-heart{fill:none;stroke:${color.script};stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:80;stroke-dashoffset:80;animation:hw-stroke .9s cubic-bezier(.45,0,.3,1) forwards;animation-delay:calc(var(--i)*1.05s + .2s)}
@keyframes hw-stroke{to{stroke-dashoffset:0}}@keyframes hw-fill{to{fill-opacity:1;stroke-opacity:.35}}
@media (prefers-reduced-motion: reduce){.hw text{animation:none;fill-opacity:1;stroke-opacity:0;stroke-dashoffset:0}.hw .hw-heart{animation:none;stroke-dashoffset:0}}`;

/**
 * Web: "More Self Love Please" writes itself line by line (outline stroke, then ink fill), then the
 * hand-drawn heart is drawn. Keyed by text so it replays on every language switch.
 */
export function SelfLoveAccent({ text, size }: { text: string; size: number }) {
  return <Writer key={text} text={text} size={size} />;
}

function Writer({ text, size }: { text: string; size: number }) {
  const lines = text.split("\n").map((l) => l.replace(String.fromCharCode(0x2661), "").trim());
  const last = useRef<SVGTextElement>(null);
  const [heartX, setHeartX] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (last.current !== null)
        setHeartX((lines.length - 1) * 8 + last.current.getComputedTextLength() + 10);
    };
    measure();
    void document.fonts.ready.then(measure);
  }, [lines.length]);
  const scale = size / 33;
  return (
    <div
      style={{ transform: "rotate(-16deg)", transformOrigin: "left center", width: 300 * scale }}
    >
      <style>{CSS}</style>
      <svg
        className="hw"
        viewBox={`0 0 300 ${String(lines.length * 40 + 16)}`}
        width={300 * scale}
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        {lines.map((l, i) => (
          <text
            key={i}
            ref={i === lines.length - 1 ? last : undefined}
            x={i * 8}
            y={34 + i * 40}
            style={{ ["--i" as string]: i }}
          >
            {l}
          </text>
        ))}
        {heartX !== null ? (
          <path
            className="hw-heart"
            style={{ ["--i" as string]: lines.length }}
            transform={`translate(${String(heartX)} ${String(34 + (lines.length - 1) * 40 - 24)}) scale(1.15)`}
            d={HAND_HEART_PATH}
          />
        ) : null}
      </svg>
    </div>
  );
}
