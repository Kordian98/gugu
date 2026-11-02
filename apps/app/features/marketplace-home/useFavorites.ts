import { useState } from "react";

/** Local favourite toggles (favourites API is topic 11; nothing is persisted yet). */
export function useFavorites() {
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  return {
    isSaved: (slug: string) => saved.has(slug),
    toggle: (slug: string) => {
      setSaved((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        return next;
      });
    },
  };
}
