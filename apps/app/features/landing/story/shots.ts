import manifest from "../../../assets/studio/shots/manifest.json";

/**
 * Story "place" shots (file drop: see scripts/story-shots.py). Placeholders are flagged in the manifest and
 * are never displayed above ~1.15x of their native pixels.
 */
export const SHOTS = {
  entrance: require("../../../assets/studio/shots/entrance.webp") as number,
  reception: require("../../../assets/studio/shots/reception.webp") as number,
  rooms: require("../../../assets/studio/shots/rooms.webp") as number,
} as const;

export type ShotName = keyof typeof SHOTS;
export const shotInfo = (name: ShotName) =>
  (manifest as Record<ShotName, { w: number; h: number; placeholder: boolean }>)[name];

/** Max CSS width at which a raster stays sharp: native px / devicePixelRatio × 1.15. */
export const maxCssWidth = (nativeW: number, dpr: number) => (nativeW / Math.max(1, dpr)) * 1.15;
