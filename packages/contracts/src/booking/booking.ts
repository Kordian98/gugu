import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { localizedNameSchema } from "../salon/registration";
import { bookingSourceSchema } from "./source";

/**
 * Booking engine HTTP contracts (topic 06, docs/tasks/06-booking-engine.md §3). Times are ISO-8601
 * instants (UTC); `date` fields are salon-local calendar dates. Money is minor units (VND: đồng).
 */

export const BOOKING_STATUS_VALUES = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled_by_customer",
  "cancelled_by_salon",
  "no_show",
] as const;
export const bookingStatusSchema = z.enum(BOOKING_STATUS_VALUES);
export type BookingStatusValue = z.infer<typeof bookingStatusSchema>;

/** Real calendar date `YYYY-MM-DD` (2026-02-30 is rejected). */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "local_date")
  .refine((v) => {
    const [y, m, d] = v.split("-").map(Number) as [number, number, number];
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, "local_date");

/** Longest date range one availability or list request may cover (inclusive). */
export const MAX_BOOKING_QUERY_DAYS = 31;

const spanDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

const dateRangeChecks = <T extends { from: string; to: string }>(schema: z.ZodType<T>) =>
  schema
    .refine((q) => q.from <= q.to, { path: ["to"], message: "to_before_from" })
    .refine((q) => q.from > q.to || spanDays(q.from, q.to) <= MAX_BOOKING_QUERY_DAYS, {
      path: ["to"],
      message: "range_too_long",
    });
const instantSchema = z.iso.datetime({ offset: true });

/** Comma-separated (query string) or repeated values → unique uuid list. */
const uuidListParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(",")).filter(Boolean)))
  .pipe(z.array(uuidV7Schema).max(10));

const uuidList = z.array(uuidV7Schema).max(10).default([]);

export const bookingParamsSchema = z.object({ salonId: uuidV7Schema, bookingId: uuidV7Schema });
export const publicSalonParamsSchema = z.object({ slug: z.string().min(1).max(120) });
export const publicBookingParamsSchema = z.object({ token: z.string().min(20).max(200) });

// ─── Availability ───────────────────────────────────────────────────────────────────────────────

export const availabilityQuerySchema = dateRangeChecks(
  z.object({
    serviceId: uuidV7Schema,
    variantId: uuidV7Schema.optional(),
    addOnIds: uuidListParam,
    /** Omit for "any staff". */
    staffId: uuidV7Schema.optional(),
    from: localDateSchema,
    to: localDateSchema,
  }),
);
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const availabilitySlotSchema = z.object({
  startsAt: instantSchema,
  endsAt: instantSchema,
  /** Staff who can take it, best "any staff" candidate first. Empty when the salon hides staff choice. */
  staffIds: z.array(uuidV7Schema),
});
/** Mirrors UNAVAILABLE_REASONS in @gugu/domain (parity tested in the API). */
export const unavailableReasonSchema = z.enum([
  "no_staff_assigned",
  "no_working_hours",
  "outside_booking_window",
  "fully_booked",
]);
export type UnavailableReasonCode = z.infer<typeof unavailableReasonSchema>;

export const availabilitySchema = z.object({
  timeZone: z.string(),
  durationMinutes: z.number().int(),
  days: z.array(z.object({ date: localDateSchema, slots: z.array(availabilitySlotSchema) })),
  /** Set only when the whole range has no slot: why (staff not assigned, no hours, window…). */
  unavailableReason: unavailableReasonSchema.nullable(),
});
export type Availability = z.infer<typeof availabilitySchema>;

/**
 * "Find the earliest slot" (CRM New appointment): searches forward from today across the booking
 * window, server-side in ≤ 31-day chunks, and returns the first `limit` start times, at most
 * `perDay` per day so the options span several days.
 */
export const earliestSlotsQuerySchema = z.object({
  serviceId: uuidV7Schema,
  variantId: uuidV7Schema.optional(),
  addOnIds: uuidListParam,
  /** Omit for "any staff". */
  staffId: uuidV7Schema.optional(),
  /** Start searching on this day (default: today in the salon timezone). */
  from: localDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  perDay: z.coerce.number().int().min(1).max(10).default(2),
});
export type EarliestSlotsQuery = z.infer<typeof earliestSlotsQuerySchema>;

export const earliestSlotsSchema = z.object({
  timeZone: z.string(),
  durationMinutes: z.number().int(),
  slots: z.array(availabilitySlotSchema.extend({ date: localDateSchema })),
  /** Set when nothing is free in the whole window. */
  unavailableReason: unavailableReasonSchema.nullable(),
});
export type EarliestSlots = z.infer<typeof earliestSlotsSchema>;

// ─── Holds (public booking page) ────────────────────────────────────────────────────────────────

const serviceSelection = {
  serviceId: uuidV7Schema,
  variantId: uuidV7Schema.nullish(),
  addOnIds: uuidList,
  /** null = any staff. */
  staffId: uuidV7Schema.nullish(),
  startsAt: instantSchema,
};

/** Opaque per-install / per-browser id (never personal data); scopes holds and rate limits. */
const deviceIdSchema = z.string().trim().min(8).max(128);

export const createHoldInputSchema = z.object({ ...serviceSelection, deviceId: deviceIdSchema });
export type CreateHoldInput = z.infer<typeof createHoldInputSchema>;

export const holdSchema = z.object({
  id: uuidV7Schema,
  staffId: uuidV7Schema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  expiresAt: instantSchema,
});
export type Hold = z.infer<typeof holdSchema>;

// ─── Create booking ─────────────────────────────────────────────────────────────────────────────

export const customerContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Vietnamese phone in any common format; normalised to E.164 by the API. */
  phone: z.string().trim().min(6).max(32),
});

export const STAFF_ENTRY_SOURCE_VALUES = [
  "staff_created",
  "walk_in",
  "phone",
  "zalo_chat",
] as const;
export const ruleOverrideSchema = z.enum(["hours", "lead_time", "horizon"]);

/** CRM: a salon member enters a booking (the entry is the confirmation — X9 class 2). */
export const createSalonBookingInputSchema = z
  .object({
    ...serviceSelection,
    source: z.enum(STAFF_ENTRY_SOURCE_VALUES).default("staff_created"),
    /** Null only for anonymous walk-ins. */
    customer: customerContactSchema.nullable(),
    note: z.string().trim().max(1000).nullish(),
    /** Audited rule overrides (q18); needs `bookings.override_rules`. */
    overrides: z.array(ruleOverrideSchema).max(3).default([]),
    overrideReason: z.string().trim().min(3).max(500).nullish(),
  })
  .refine((b) => b.customer !== null || b.source === "walk_in", {
    path: ["customer"],
    message: "customer_required",
  })
  .refine((b) => b.overrides.length === 0 || Boolean(b.overrideReason), {
    path: ["overrideReason"],
    message: "reason_required",
  });
export type CreateSalonBookingInput = z.infer<typeof createSalonBookingInputSchema>;

/** Public salon booking page (customer self-service, no OTP — X11). */
export const createPublicBookingInputSchema = z.object({
  ...serviceSelection,
  holdId: uuidV7Schema.nullish(),
  deviceId: deviceIdSchema,
  customer: customerContactSchema,
  note: z.string().trim().max(500).nullish(),
  source: z
    .enum(["salon_profile", "direct_link", "qr_code", "social_media", "zalo_link", "zalo_oa"])
    .default("salon_profile"),
});
export type CreatePublicBookingInput = z.infer<typeof createPublicBookingInputSchema>;

// ─── Read models ────────────────────────────────────────────────────────────────────────────────

export const bookedAddOnSchema = z.object({
  addOnId: uuidV7Schema,
  name: localizedNameSchema,
  extraDurationMinutes: z.number().int(),
  extraPriceMinor: z.number().int(),
  extraPriceMaxMinor: z.number().int().nullable(),
});

export const bookedServiceSchema = z.object({
  serviceId: uuidV7Schema,
  variantId: uuidV7Schema.nullable(),
  name: localizedNameSchema,
  variantName: localizedNameSchema.nullable(),
  durationMinutes: z.number().int(),
  bufferBeforeMinutes: z.number().int(),
  bufferAfterMinutes: z.number().int(),
  priceMinor: z.number().int(),
  priceMaxMinor: z.number().int().nullable(),
  addOns: z.array(bookedAddOnSchema),
});

const bookingCore = {
  id: uuidV7Schema,
  referenceCode: z.string(),
  status: bookingStatusSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  staffId: uuidV7Schema,
  service: bookedServiceSchema,
  totalPriceMinor: z.number().int(),
  totalPriceMaxMinor: z.number().int().nullable(),
  currency: z.string(),
  /** Customers pay at the salon; GuGu processes no payment (master §2). */
  paymentMethod: z.literal("pay_at_salon"),
};

/** CRM view of a booking (salon members only). */
export const salonBookingSchema = z.object({
  ...bookingCore,
  source: bookingSourceSchema,
  customer: z.object({ name: z.string(), phone: z.string().nullable() }).nullable(),
  identityVerified: z.boolean(),
  note: z.string().nullable(),
  lateCancellation: z.boolean(),
  ruleOverrides: z.array(ruleOverrideSchema),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  version: z.number().int(),
});
export type SalonBooking = z.infer<typeof salonBookingSchema>;

export const salonBookingListQuerySchema = dateRangeChecks(
  z.object({
    from: localDateSchema,
    to: localDateSchema,
    staffId: uuidV7Schema.optional(),
    status: bookingStatusSchema.optional(),
  }),
);
export type SalonBookingListQuery = z.infer<typeof salonBookingListQuerySchema>;
export const salonBookingListSchema = z.object({ items: z.array(salonBookingSchema) });

/** Customer view behind the booking's manage link. */
export const publicBookingSchema = z.object({
  ...bookingCore,
  salon: z.object({ name: z.string(), slug: z.string(), timeZone: z.string() }),
  customerName: z.string(),
  cancellable: z.boolean(),
  reschedulable: z.boolean(),
});
export type PublicBooking = z.infer<typeof publicBookingSchema>;

/** Returned once on creation: the manage token goes into the confirmation link, never stored raw. */
export const publicBookingCreatedSchema = z.object({
  booking: publicBookingSchema,
  manageToken: z.string(),
});
export type PublicBookingCreated = z.infer<typeof publicBookingCreatedSchema>;

// ─── Commands ───────────────────────────────────────────────────────────────────────────────────

export const transitionInputSchema = z.object({
  to: bookingStatusSchema,
  reason: z.string().trim().max(500).nullish(),
});
export type TransitionInput = z.infer<typeof transitionInputSchema>;

export const rescheduleInputSchema = z.object({
  startsAt: instantSchema,
  /** Salon only; omit to keep the staff member, null for any staff. */
  staffId: uuidV7Schema.nullish(),
  overrides: z.array(ruleOverrideSchema).max(3).default([]),
  overrideReason: z.string().trim().min(3).max(500).nullish(),
});
export type RescheduleInput = z.infer<typeof rescheduleInputSchema>;

export const publicCancelInputSchema = z.object({
  reason: z.string().trim().max(500).nullish(),
});
export const publicRescheduleInputSchema = z.object({ startsAt: instantSchema });
