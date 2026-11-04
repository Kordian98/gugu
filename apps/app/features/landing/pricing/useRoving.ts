import { useRef } from "react";

type Focusable = { focus?: () => void } | null;
type KeyEvent = { key: string; preventDefault: () => void };

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Roving tabindex for a radio group (WAI-ARIA APG): only the checked option is in the tab order;
 * arrow keys move the selection and the focus. Web keyboard only; native ignores the props.
 * Spread the result of `props(i)` on option `i`.
 */
export function useRoving<T extends string>(
  values: readonly T[],
  value: T,
  onChange: (v: T) => void,
) {
  const refs = useRef<Focusable[]>([]);
  return (i: number) =>
    ({
      ref: (el: Focusable) => {
        refs.current[i] = el;
      },
      tabIndex: values[i] === value ? 0 : -1,
      onKeyDown: (e: KeyEvent) => {
        const d = STEP[e.key];
        if (d === undefined) return;
        e.preventDefault();
        const n = (i + d + values.length) % values.length;
        const next = values[n];
        if (next === undefined) return;
        onChange(next);
        refs.current[n]?.focus?.();
      },
    }) as object;
}
