import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Asset } from "expo-asset";

import { HERO_IMG as IMG, HERO_VIDEO as VIDEO } from "./assets";

const uri = (mod: number) => Asset.fromModule(mod).uri;
const noopSubscribe = () => () => undefined;
const allowMotion = () => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return !reduce && conn?.saveData !== true && !/2g/.test(conn?.effectiveType ?? "");
};

/**
 * Web hero: poster <img> first (LCP), then a muted seamless loop that fades in once playing.
 * Edges fade into the page with a CSS mask (desktop). Skipped for reduced motion / data saver / 2G.
 */
export function HeroMedia({
  fadeEdges = true,
  small = false,
}: {
  fadeEdges?: boolean;
  small?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // false on the server and during hydration (poster only), then evaluated on the client.
  const motion = useSyncExternalStore(noopSubscribe, allowMotion, () => false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!motion || v === null) return;
    void v.play().catch(() => undefined);
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting === true && !document.hidden) void v.play().catch(() => undefined);
      else v.pause();
    });
    io.observe(v);
    return () => {
      io.disconnect();
    };
  }, [motion]);
  const mask = fadeEdges
    ? "linear-gradient(to right, transparent 0, #000 6%), linear-gradient(to top, transparent 0, #000 9%)"
    : "linear-gradient(to top, transparent 0, #000 10%)";
  const fill: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };
  const wrap: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskComposite: "source-in",
    maskComposite: "intersect",
  };
  return (
    <div style={wrap} aria-hidden="true">
      <img
        src={uri(small ? IMG.diorama : IMG.dioramaLarge)}
        alt=""
        style={fill}
        fetchPriority="high"
      />
      {motion ? (
        <video
          ref={ref}
          src={uri(small ? VIDEO.loop900 : VIDEO.loop1400)}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          onPlaying={() => {
            setReady(true);
          }}
          style={{ ...fill, opacity: ready ? 1 : 0, transition: "opacity 700ms ease" }}
        />
      ) : null}
    </div>
  );
}
