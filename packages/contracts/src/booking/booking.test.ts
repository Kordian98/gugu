import { describe, expect, it } from "vitest";
import {
  availabilityQuerySchema,
  createSalonBookingInputSchema,
  localDateSchema,
  MAX_BOOKING_QUERY_DAYS,
  salonBookingListQuerySchema,
} from "./booking";

const SERVICE = "0190f000-0000-7000-8000-0000000000a1";
const STAFF = "0190f000-0000-7000-8000-0000000000b1";

describe("booking contracts", () => {
  it("local dates must be real calendar dates", () => {
    expect(localDateSchema.safeParse("2026-02-28").success).toBe(true);
    expect(localDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(localDateSchema.safeParse("2026-2-1").success).toBe(false);
  });

  it("availability: range order and at most 31 days (security review)", () => {
    const q = { serviceId: SERVICE, from: "2026-11-01", to: "2026-12-01" };
    expect(MAX_BOOKING_QUERY_DAYS).toBe(31);
    expect(availabilityQuerySchema.safeParse(q).success).toBe(true);
    expect(availabilityQuerySchema.safeParse({ ...q, to: "2026-12-02" }).success).toBe(false);
    expect(
      availabilityQuerySchema.safeParse({ ...q, from: "0001-01-01", to: "9999-12-31" }).success,
    ).toBe(false);
    expect(availabilityQuerySchema.safeParse({ ...q, to: "2026-10-31" }).success).toBe(false);
    expect(
      salonBookingListQuerySchema.safeParse({ from: "2026-11-01", to: "2027-11-01" }).success,
    ).toBe(false);
  });

  it("availability: add-on ids from a comma list", () => {
    const parsed = availabilityQuerySchema.parse({
      serviceId: SERVICE,
      addOnIds: `${SERVICE},${STAFF}`,
      from: "2026-11-01",
      to: "2026-11-01",
    });
    expect(parsed.addOnIds).toEqual([SERVICE, STAFF]);
  });

  it("CRM booking: customer only optional for walk-ins; overrides need a reason", () => {
    const base = { serviceId: SERVICE, startsAt: "2026-11-03T03:00:00Z", customer: null };
    expect(createSalonBookingInputSchema.safeParse(base).success).toBe(false);
    expect(createSalonBookingInputSchema.safeParse({ ...base, source: "walk_in" }).success).toBe(
      true,
    );
    expect(
      createSalonBookingInputSchema.safeParse({ ...base, source: "walk_in", overrides: ["hours"] })
        .success,
    ).toBe(false);
  });
});
