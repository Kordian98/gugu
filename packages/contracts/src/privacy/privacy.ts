import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

/**
 * Privacy tools for salons (topic 05 step 8). Customers have no GuGu account (X23): each client
 * record belongs to one salon, and the salon answers its clients' requests with these tools
 * (owner decision q80). Owner-only: `customers.export` (one client or the whole salon) and
 * `customers.erase`. Designed to support data-subject requests; GuGu makes no compliance claim.
 */

export const PRIVACY_ERRORS = {
  /** Another salon-wide export is queued or running. */
  exportInProgress: "privacy.export_in_progress",
  /** The export is not ready yet, failed, or its file was purged after 24 h. */
  exportUnavailable: "privacy.export_unavailable",
  exportNotFound: "privacy.export_not_found",
} as const;

/** A salon-wide export file can be downloaded for this long, then its content is purged. */
export const PRIVACY_EXPORT_TTL_HOURS = 24;

/** Notification send log rows are deleted after this many months (spec 11 R20). */
export const NOTIFICATION_DELIVERY_RETENTION_MONTHS = 12;

export const privacyExportParamsSchema = z.object({
  salonId: uuidV7Schema,
  exportId: uuidV7Schema,
});

// ─── One client ────────────────────────────────────────────────────────────────────────────────

const localizedName = z.object({ vi: z.string(), en: z.string() });

export const clientExportBookingSchema = z.object({
  id: uuidV7Schema,
  referenceCode: z.string(),
  status: z.string(),
  source: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  services: z.array(z.object({ name: localizedName, priceMinor: z.number().int() })),
  totalPriceMinor: z.number().int(),
  currency: z.string(),
  /** Contact snapshot stored on the booking. */
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerEmail: z.string().nullable(),
  customerNote: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  payment: z
    .object({
      amountMinor: z.number().int(),
      method: z.string(),
      recordedAt: z.iso.datetime(),
    })
    .nullable(),
  history: z.array(
    z.object({
      from: z.string().nullable(),
      to: z.string(),
      at: z.iso.datetime(),
      reasonCode: z.string().nullable(),
      reasonText: z.string().nullable(),
    }),
  ),
});

export const clientExportSchema = z.object({
  format: z.literal("gugu.client-export.v1"),
  exportedAt: z.iso.datetime(),
  salon: z.object({ id: uuidV7Schema, name: z.string() }),
  client: z.object({
    id: uuidV7Schema,
    displayName: z.string(),
    phone: z.string().nullable(),
    tags: z.array(z.string()),
    marketingConsent: z.object({ zalo: z.boolean(), email: z.boolean(), sms: z.boolean() }),
    source: z.string(),
    createdAt: z.iso.datetime(),
  }),
  bookings: z.array(clientExportBookingSchema),
  /** The salon's internal notes about the client (author names are left out). */
  notes: z.array(z.object({ body: z.string(), createdAt: z.iso.datetime() })),
  zalo: z.array(
    z.object({
      conversationId: uuidV7Schema,
      displayName: z.string().nullable(),
      phone: z.string().nullable(),
      followedAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
      messages: z.array(
        z.object({
          at: z.iso.datetime(),
          direction: z.string(),
          sender: z.string(),
          kind: z.string(),
          text: z.string().nullable(),
        }),
      ),
    }),
  ),
  /** Messages sent to the client (log only: no address or content is stored). */
  notificationDeliveries: z.array(
    z.object({
      bookingReference: z.string().nullable(),
      event: z.string(),
      channel: z.string(),
      status: z.string(),
      reason: z.string().nullable(),
      createdAt: z.iso.datetime(),
      sentAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type ClientExport = z.infer<typeof clientExportSchema>;

/** `POST /salons/:salonId/customers/:customerId/export` (audited). */
export const clientExportResultSchema = z.object({
  fileBaseName: z.string(),
  json: clientExportSchema,
  /** The same data as a human-readable text document in the requested locale. */
  text: z.string(),
});
export type ClientExportResult = z.infer<typeof clientExportResultSchema>;

export const clientExportInputSchema = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

/**
 * `POST /salons/:salonId/customers/:customerId/erase`. Irreversible: the profile, notes, tags and
 * the client's Zalo chat content are removed; bookings stay for the salon's history but lose
 * their contact snapshot (shown as "deleted customer"); upcoming bookings are cancelled.
 */
export const clientEraseInputSchema = z.object({ confirm: z.literal(true) });
export type ClientEraseInput = z.infer<typeof clientEraseInputSchema>;

export const clientEraseResultSchema = z.object({
  anonymisedBookings: z.number().int(),
  cancelledBookings: z.number().int(),
  deletedNotes: z.number().int(),
  zaloConversations: z.number().int(),
  deletedZaloMessages: z.number().int(),
});
export type ClientEraseResult = z.infer<typeof clientEraseResultSchema>;

// ─── Whole salon (async) ─────────────────────────────────────────────────────────────────────────

export const PRIVACY_EXPORT_STATUSES = ["queued", "running", "ready", "failed", "expired"] as const;
export const privacyExportStatusSchema = z.enum(PRIVACY_EXPORT_STATUSES);

export const salonExportSchema = z.object({
  id: uuidV7Schema,
  status: privacyExportStatusSchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  /** Download possible until then (ready only). */
  expiresAt: z.iso.datetime().nullable(),
  clients: z.number().int().nullable(),
  bookings: z.number().int().nullable(),
  sizeBytes: z.number().int().nullable(),
});
export type SalonExport = z.infer<typeof salonExportSchema>;
export const salonExportListSchema = z.object({ items: z.array(salonExportSchema) });
export type SalonExportList = z.infer<typeof salonExportListSchema>;

export const SALON_EXPORT_FORMATS = ["json", "csv"] as const;
export const salonExportDownloadQuerySchema = z.object({
  format: z.enum(SALON_EXPORT_FORMATS).default("json"),
});
/** Download is an authenticated panel call only: no signed public link, nothing emailed. */
export const salonExportDownloadSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  content: z.string(),
});
export type SalonExportDownload = z.infer<typeof salonExportDownloadSchema>;
