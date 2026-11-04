import { useEffect, useRef, useState } from "react";
import { Easing } from "react-native";

import { motion } from "@gugu/design-system";

const [x1, y1, x2, y2] = motion.bezier.out;
const EASE_OUT = Easing.bezier(x1, y1, x2, y2);

/**
 * Number that glides to its new value (`motion.bezier.out` over `motion.duration.deliberate`) whenever the
 * target changes; jumps straight there with reduced motion. Whole numbers only (VND, hours).
 */
export function useCountUp(target: number, reduce: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const start = from.current;
    if (reduce || start === target || typeof requestAnimationFrame === "undefined") {
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = Date.now();
    const duration = motion.duration.deliberate;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = EASE_OUT(p);
      const v = Math.round(start + (target - start) * eased);
      from.current = v;
      setShown(v);
      frame.current = p < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, reduce]);

  return shown;
}
