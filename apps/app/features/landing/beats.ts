/** Story chapters in scroll order (X22/X23). Each chapter gets an equal share of the pinned scroll. */
export const BEATS = [
  "dive",
  "before",
  "calendar",
  "clients",
  "reminders",
  "ai",
  "insights",
  "assistant",
  "finale",
] as const;
export type Beat = (typeof BEATS)[number];

/** Beats whose visual is a message example (shown with the "illustrative" note). */
export const ILLUSTRATIVE: readonly Beat[] = ["before", "reminders", "ai", "assistant", "finale"];
