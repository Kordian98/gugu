import { useEffect, useRef, useState } from "react";
import { Animated, Platform } from "react-native";

import { motion } from "@gugu/design-system";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Pop + check draw-in whenever `trigger` changes (skipped with reduced motion). */
export function usePop(trigger: string, reduce: boolean) {
  const [scale] = useState(() => new Animated.Value(1));
  const [check] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      return;
    }
    scale.setValue(0.965);
    check.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        ...motion.spring.pop,
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(check, {
        toValue: 1,
        duration: motion.duration.slow,
        delay: motion.duration.fast,
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]).start();
  }, [trigger, reduce, scale, check]);
  return { scale, check };
}

/** Brief glow (0 → 1 → 0) whenever `trigger` changes; nothing with reduced motion. */
export function usePulse(trigger: number, reduce: boolean) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (trigger === 0 || reduce) return;
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, {
        toValue: 1,
        duration: motion.duration.fast,
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(v, {
        toValue: 0,
        duration: motion.duration.deliberate,
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]).start();
  }, [trigger, reduce, v]);
  return v;
}
