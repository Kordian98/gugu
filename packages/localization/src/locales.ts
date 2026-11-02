/** Supported locales (topic 03 R16). Adding a locale = add it here + its dictionaries. */
export const LOCALES = ["vi", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "vi";
/** Each locale's name in its own language (shown in language pickers). */
export const LOCALE_LABELS: Record<AppLocale, string> = { vi: "Tiếng Việt", en: "English" };
export const isLocale = (v: unknown): v is AppLocale =>
  typeof v === "string" && (LOCALES as readonly string[]).includes(v);
