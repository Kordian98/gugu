import { z } from "zod";

export const MAX_PAGE_LIMIT = 100;

/** Cursor pagination query (ADR-0003). */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(20),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
