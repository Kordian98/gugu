import { hourInZone } from "@gugu/localization";

/** Greeting slot by the salon's local hour. */
export function greetingKey(now: Date): "morning" | "noon" | "afternoon" | "evening" {
  const h = hourInZone(now);
  if (h < 11) return "morning";
  if (h < 14) return "noon";
  if (h < 18) return "afternoon";
  return "evening";
}
