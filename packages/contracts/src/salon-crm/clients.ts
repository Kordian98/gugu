import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

/**
 * Quick client pick for the CRM booking flow (07 §3.4, M7.2). Until the Customers module (M7.7)
 * adds `CustomerSalonProfile`, suggestions come from the salon's own past bookings (same salon only;
 * no cross-salon data, q68). A new client is created simply by booking with name + phone.
 */
export const clientLookupQuerySchema = z.object({
  /** Phone digits or part of a name (diacritic-insensitive). Empty = most recent clients. */
  q: z.string().trim().max(60).default(""),
});
export type ClientLookupQuery = z.infer<typeof clientLookupQuerySchema>;

export const clientSuggestionSchema = z.object({
  name: z.string(),
  phone: z.string(),
  visits: z.number().int(),
  lastVisitAt: z.iso.datetime(),
  /** Prefill for "book again" (07 §3.4: last service and staff). */
  lastServiceId: uuidV7Schema,
  lastVariantId: uuidV7Schema.nullable(),
  lastStaffId: uuidV7Schema,
  noShows: z.number().int(),
});
export type ClientSuggestion = z.infer<typeof clientSuggestionSchema>;

export const clientSuggestionListSchema = z.object({ items: z.array(clientSuggestionSchema) });
