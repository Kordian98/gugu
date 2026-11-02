import { createContext, useContext, type ReactNode } from "react";

/**
 * Pixel scale for artboard layouts. Desktop marketing pages are authored in reference pixels
 * (ref-01 is 2048 px wide); `u` converts a reference pixel to a device pixel.
 */
const ScaleContext = createContext(1);

export function ScaleProvider({ u, children }: { u: number; children: ReactNode }) {
  return <ScaleContext.Provider value={u}>{children}</ScaleContext.Provider>;
}

/** Returns a function mapping reference pixels to device pixels. */
export function useScale(): (px: number) => number {
  const u = useContext(ScaleContext);
  return (px: number) => px * u;
}
