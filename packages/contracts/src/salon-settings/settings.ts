import { z } from "zod";
import { localizedLongTextSchema } from "../catalog/catalog";
import { uuidV7Schema } from "../common/ids";
import { intervalSchema, nonOverlapping, weekdaySchema } from "../team/team";

/**
 * Salon settings: profile, address, opening hours, holidays, booking/confirmation and cancellation
 * policy (topic 07 M7.5; owner answers q13, q14, q18, q66). Read by the booking engine (06).
 */

export const SETTINGS_ERRORS = {
  holidayNotFound: "settings.holiday_not_found",
  goLiveIncomplete: "settings.go_live_incomplete",
} as const;

const dateSchema = z.iso.date();

export const salonProfileInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  description: localizedLongTextSchema.nullable().default(null),
  streetAddress: z.string().trim().min(3).max(200),
  provinceId: uuidV7Schema,
  wardId: uuidV7Schema,
});
export type SalonProfileInput = z.infer<typeof salonProfileInputSchema>;

export const bookingSettingsSchema = z.object({
  confirmationMode: z.enum(["auto", "manual"]),
  manualConfirmWindowHours: z.number().int().min(1).max(72),
  confirmNewClients: z.boolean(),
  hideStaffChoice: z.boolean(),
  minLeadTimeMinutes: z.number().int().min(0).max(10_080),
  bookingWindowDays: z.number().int().min(1).max(365),
  cancellationCutoffMinutes: z.number().int().min(0).max(10_080),
  rescheduleCutoffMinutes: z.number().int().min(0).max(10_080),
  slotGranularityMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
});
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;

export const policiesInputSchema = z.object({
  bookingPolicy: localizedLongTextSchema.nullable(),
  cancellationPolicy: localizedLongTextSchema.nullable(),
});
export type PoliciesInput = z.infer<typeof policiesInputSchema>;

export const openingDaySchema = z
  .object({ weekday: weekdaySchema, intervals: z.array(intervalSchema).max(4) })
  .refine((d) => nonOverlapping(d.intervals), { path: ["intervals"], message: "overlap" });

export const openingHoursSchema = z.object({
  days: z
    .array(openingDaySchema)
    .max(7)
    .refine((ds) => new Set(ds.map((d) => d.weekday)).size === ds.length, "duplicate_weekday"),
});
export type OpeningHours = z.infer<typeof openingHoursSchema>;
export type OpeningHoursInput = z.input<typeof openingHoursSchema>;

export const holidayInputSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    closed: z.boolean().default(true),
    interval: intervalSchema.nullable().default(null),
    reason: z.string().trim().max(120).nullable().default(null),
  })
  .refine((h) => h.startDate <= h.endDate, { path: ["endDate"], message: "end_before_start" })
  .refine((h) => h.closed || h.interval !== null, { path: ["interval"], message: "required" });
export type HolidayInput = z.infer<typeof holidayInputSchema>;

export const holidaySchema = z.object({
  id: uuidV7Schema,
  startDate: dateSchema,
  endDate: dateSchema,
  closed: z.boolean(),
  interval: intervalSchema.nullable(),
  reason: z.string().nullable(),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const salonSettingsSchema = z.object({
  profile: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    description: z.object({ vi: z.string(), en: z.string() }).nullable(),
    address: z
      .object({ streetAddress: z.string(), provinceId: uuidV7Schema, wardId: uuidV7Schema })
      .nullable(),
    status: z.enum(["draft", "pending_review", "active", "suspended", "closed"]),
    slug: z.string(),
  }),
  booking: bookingSettingsSchema,
  policies: z.object({
    bookingPolicy: z.object({ vi: z.string(), en: z.string() }).nullable(),
    cancellationPolicy: z.object({ vi: z.string(), en: z.string() }).nullable(),
  }),
  openingHours: openingHoursSchema,
  holidays: z.array(holidaySchema),
});
export type SalonSettings = z.infer<typeof salonSettingsSchema>;

export const holidayParamsSchema = z.object({ salonId: uuidV7Schema, holidayId: uuidV7Schema });

export const ONBOARDING_STEPS = ["business", "services", "hours", "team", "live"] as const;
export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

/** Real setup progress (07 §3.7). Photos join once the media service exists. */
export const onboardingSchema = z.object({
  done: z.array(onboardingStepSchema),
  total: z.number().int(),
  canGoLive: z.boolean(),
});
export type Onboarding = z.infer<typeof onboardingSchema>;
