import { z } from "zod";

/**
 * RFC 9457 problem details returned by every API error (ADR-0003).
 * `code` is stable and maps to an `errors.*` translation key on the client.
 */
export const problemSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  detail: z.string().optional(),
  instance: z.string().optional(),
  traceId: z.string().optional(),
  errors: z
    .array(z.object({ path: z.string(), code: z.string(), message: z.string().optional() }))
    .optional(),
});

export type Problem = z.infer<typeof problemSchema>;
