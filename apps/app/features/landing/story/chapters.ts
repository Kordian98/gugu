/**
 * The story is a walk through the salon (owner direction): each chapter is a "place".
 * Pain chapters first, then the same moments resolved in GuGu Studio, then switching.
 */
export const CHAPTERS = [
  "dive",
  "pain1",
  "pain2",
  "calendar",
  "reminders",
  "assistant",
  "finale",
  "calm",
  "switch",
] as const;
export type Chapter = (typeof CHAPTERS)[number];

/** Chapters whose visuals are message examples (shown with the "illustrative" note). */
export const ILLUSTRATIVE: readonly Chapter[] = [
  "pain1",
  "pain2",
  "reminders",
  "assistant",
  "finale",
  "switch",
];

/** Diorama camera targets (fractions of the ref-01 diorama image) and zoom per place. */
export const CAMERA = {
  entrance: { x: 0.5, y: 0.5, s: 1 },
  reception: { x: 0.64, y: 0.68, s: 2.5 },
  rooms: { x: 0.42, y: 0.34, s: 2.1 },
  calm: { x: 0.6, y: 0.62, s: 1.6 },
} as const;
