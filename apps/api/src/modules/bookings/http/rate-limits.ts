import type { RateLimitRule } from "../../../infrastructure/rate-limit/rate-limit.service";

/**
 * Public booking page limits (X11: no OTP wall, spec 06 §3.11). Subjects are hashes (device,
 * phone) or IP prefixes — never raw personal data.
 */
export const PUBLIC_BOOKING_LIMITS = {
  availabilityPerIp: { name: "booking.availability.ip", limit: 120, windowSeconds: 600 },
  holdsPerDevice: { name: "booking.hold.device", limit: 10, windowSeconds: 600 },
  holdsPerIp: { name: "booking.hold.ip", limit: 40, windowSeconds: 600 },
  bookingsPerDevice: { name: "booking.create.device", limit: 5, windowSeconds: 3600 },
  bookingsPerIp: { name: "booking.create.ip", limit: 20, windowSeconds: 3600 },
  bookingsPerPhone: { name: "booking.create.phone", limit: 3, windowSeconds: 3600 },
  manageLinkPerIp: { name: "booking.manage.ip", limit: 60, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;
