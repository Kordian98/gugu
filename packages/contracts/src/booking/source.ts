import { z } from "zod";

/**
 * Booking / acquisition source — the single enum owned by topic 12 (cross-topic resolution X6,
 * docs/tasks/12-monetization-admin.md §3.1a). Add values here only through topic 12; the booking
 * engine classifies each value into an actor class (packages/domain/src/booking/draft-policy.ts).
 */
export const BOOKING_SOURCES = [
  "marketplace",
  "salon_profile",
  "direct_link",
  "qr_code",
  "social_media",
  "repeat_customer",
  "staff_created",
  "walk_in",
  "phone",
  "zalo_chat",
  "zalo_oa",
  "zalo_link",
  "zalo_mini_app",
  "promoted_listing",
  "gugu_campaign",
  "ai_agent",
] as const;
export const bookingSourceSchema = z.enum(BOOKING_SOURCES);
export type BookingSource = z.infer<typeof bookingSourceSchema>;
