import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";

import { SeqPlayer, type Segment } from "./sequence";
import { trackTimeline } from "./timelines";

type Build = (tl: gsap.core.Timeline, q: (sel: string) => Element[]) => void;

/**
 * One leg of the walk through the salon (web only): a sticky 16:9 band whose canvas scrubs a real frame
 * sequence with scroll (the camera move is generated video, never a zoomed still). The walk runs over
 * [0, walkEnd] of the track; `build` adds overlays on the same scrubbed timeline.
 */
export function Walk({
  seg,
  vh,
  walkEnd = 1,
  build,
  id,
  children,
  after,
}: {
  seg: Segment;
  vh: number;
  walkEnd?: number;
  build?: Build;
  id?: string;
  children?: ReactNode;
  /** Mobile-only content rendered after the pinned band (overlays are hidden on small screens). */
  after?: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const el = track.current;
    const cv = canvas.current;
    if (el === null || cv === null) return;
    const mobile = window.matchMedia("(max-width: 899px)").matches;
    const player = new SeqPlayer(cv, seg, mobile);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          player.load();
          io.disconnect();
        }
      },
      { rootMargin: "150% 0px 150% 0px" },
    );
    io.observe(el);
    const onResize = () => {
      player.resize();
    };
    onResize();
    window.addEventListener("resize", onResize);
    const proxy = { p: 0 };
    const ctx = gsap.context(() => {
      const tl = trackTimeline(el, 0.45);
      tl.to(
        proxy,
        {
          p: 1,
          duration: walkEnd,
          ease: "none",
          onUpdate: () => {
            player.set(proxy.p);
          },
        },
        0,
      );
      build?.(tl, gsap.utils.selector(el));
    }, el);
    return () => {
      ctx.revert();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      player.destroy();
    };
  }, [seg, walkEnd, build]);

  return (
    <>
      <div className="wk" ref={track} id={id} style={{ height: `${String(vh)}vh` }}>
        <div className="wk-stage">
          <div className="wk-band">
            <canvas ref={canvas} aria-hidden />
            {children}
          </div>
        </div>
      </div>
      {after}
    </>
  );
}
