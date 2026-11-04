import { useEffect } from "react";
import { Platform } from "react-native";

/** Nearest scrolling ancestor (the RN Web ScrollView element). */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

/**
 * WCAG 2.4.11 (focus not obscured): while the phone CTA bar is pinned to the bottom, the scroller
 * gets `scroll-padding-bottom` = bar height (browsers then scroll focused controls clear of it), and
 * any control focused under the bar is scrolled up. Web only; no-op on native or when `barHeight` is 0.
 */
export function useFocusClearance(sectionTestId: string, barHeight: number) {
  useEffect(() => {
    if (Platform.OS !== "web" || barHeight <= 0 || typeof document === "undefined") return;
    const section = document.querySelector<HTMLElement>(`[data-testid="${sectionTestId}"]`);
    const sc = section ? scroller(section) : null;
    if (!section || !sc) return;
    const prev = sc.style.scrollPaddingBottom;
    sc.style.scrollPaddingBottom = `${String(barHeight)}px`;
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest(`[data-testid="${sectionTestId}-cta-bar"]`)) return;
      const r = target.getBoundingClientRect();
      const limit = sc.getBoundingClientRect().bottom - barHeight;
      if (r.bottom > limit) sc.scrollBy({ top: r.bottom - limit + 8 });
    };
    section.addEventListener("focusin", onFocus);
    return () => {
      section.removeEventListener("focusin", onFocus);
      sc.style.scrollPaddingBottom = prev;
    };
  }, [sectionTestId, barHeight]);
}
