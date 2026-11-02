import { z } from "zod";

/** UUIDv7 identifiers (time-sortable), used for every primary key (ADR-0003). */
export const uuidV7Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "uuid_v7");

export type UuidV7 = z.infer<typeof uuidV7Schema>;

/** Supported UI/content locales. `vi` is the default (master prompt §5). */
export const localeSchema = z.enum(["vi", "en"]);
export type Locale = z.infer<typeof localeSchema>;
export const DEFAULT_LOCALE: Locale = "vi";
