import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

/**
 * Customers directory and client profile (topic 07 M7.7, §3.5). Visit statistics come from the
 * salon's own bookings by phone; internal notes are team-only and never leave the CRM.
 */

export const CUSTOMER_ERRORS = {
  notFound: "customers.not_found",
  phoneTaken: "customers.phone_taken",
  noteNotFound: "customers.note_not_found",
} as const;

export const CUSTOMER_SEGMENTS = ["all", "new", "returning", "at_risk", "no_shows"] as const;
export const customerSegmentSchema = z.enum(CUSTOMER_SEGMENTS);

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(60).default(""),
  segment: customerSegmentSchema.default("all"),
  tag: z.string().trim().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const consentSchema = z.object({
  zalo: z.boolean().default(false),
  email: z.boolean().default(false),
  sms: z.boolean().default(false),
});

export const customerSummarySchema = z.object({
  id: uuidV7Schema,
  displayName: z.string(),
  /** Masked when the member lacks customers.phone.read. */
  phone: z.string().nullable(),
  tags: z.array(z.string()),
  visits: z.number().int(),
  noShows: z.number().int(),
  lastVisitAt: z.iso.datetime().nullable(),
  nextVisitAt: z.iso.datetime().nullable(),
  /** Sum of completed booking prices (RevenueKind estimated_from_bookings). */
  estimatedSpend: z.number().int(),
  atRisk: z.boolean(),
});
export type CustomerSummary = z.infer<typeof customerSummarySchema>;

export const customerListSchema = z.object({
  items: z.array(customerSummarySchema),
  total: z.number().int(),
  tags: z.array(z.string()),
});
export type CustomerList = z.infer<typeof customerListSchema>;

export const customerNoteSchema = z.object({
  id: uuidV7Schema,
  body: z.string(),
  authorName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  mine: z.boolean(),
});

export const customerVisitSchema = z.object({
  bookingId: uuidV7Schema,
  startsAt: z.iso.datetime(),
  status: z.string(),
  service: z.object({ vi: z.string(), en: z.string() }),
  staffId: uuidV7Schema,
  priceMinor: z.number().int(),
});

/**
 * Optional email kept on the client profile (q87): stored for the salon's own records only —
 * GuGu never sends email to a salon's customers (X26). Same visibility as the phone number.
 */
export const customerEmailSchema = z.email().max(254);

export const customerDetailSchema = customerSummarySchema.extend({
  /** Masked when the member lacks customers.phone.read (same rule as the phone). */
  email: z.string().nullable(),
  consent: consentSchema,
  createdAt: z.iso.datetime(),
  upcoming: z.array(customerVisitSchema),
  history: z.array(customerVisitSchema),
  /** Present only with customers.notes.write (team-only). */
  notes: z.array(customerNoteSchema).nullable(),
  /** Services this client books most (derived). */
  favouriteServiceIds: z.array(uuidV7Schema),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;

export const customerInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(32).nullable().default(null),
  email: customerEmailSchema.nullable().default(null),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

export const customerUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  consent: consentSchema.optional(),
  /** Needs customers.phone.read (the same rule that shows the address unmasked). Null clears it. */
  email: customerEmailSchema.nullable().optional(),
});
export type CustomerUpdate = z.input<typeof customerUpdateSchema>;

export const customerNoteInputSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const customerParamsSchema = z.object({ salonId: uuidV7Schema, customerId: uuidV7Schema });
export const customerNoteParamsSchema = customerParamsSchema.extend({ noteId: uuidV7Schema });
