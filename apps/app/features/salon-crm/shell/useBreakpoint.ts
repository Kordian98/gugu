import { useWindowDimensions } from "react-native";

export type CrmBreakpoint = "mobile" | "tablet" | "desktop" | "wide";

/** 07 §3.3 widths: mobile < 768 ≤ tablet < 1024 ≤ desktop < 1280 ≤ wide. */
export function useBreakpoint(): CrmBreakpoint {
  const { width } = useWindowDimensions();
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  if (width < 1280) return "desktop";
  return "wide";
}
