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

  it("multi-service (M6.8): nextServices as a JSON query param; at most 3; default single", () => {
    const q = { serviceId: SERVICE, from: "2026-11-01", to: "2026-11-01" };
    expect(availabilityQuerySchema.parse(q).nextServices).toEqual([]);
    const next = [{ serviceId: STAFF, staffId: null }, { serviceId: SERVICE }];
    const parsed = availabilityQuerySchema.parse({ ...q, nextServices: JSON.stringify(next) });
    expect(parsed.nextServices.map((n) => n.serviceId)).toEqual([STAFF, SERVICE]);
    expect(parsed.nextServices[1]?.addOnIds).toEqual([]);
    expect(availabilityQuerySchema.safeParse({ ...q, nextServices: "[{" }).success).toBe(false);
    const four = JSON.stringify(Array.from({ length: 4 }, () => ({ serviceId: SERVICE })));
    expect(availabilityQuerySchema.safeParse({ ...q, nextServices: four }).success).toBe(false);
    const body = { serviceId: SERVICE, startsAt: "2026-11-03T03:00:00Z", source: "walk_in" };
    expect(createSalonBookingInputSchema.parse({ ...body, customer: null }).nextServices).toEqual(
      [],
    );
    expect(
      createSalonBookingInputSchema.parse({ ...body, customer: null, nextServices: next })
        .nextServices,
    ).toHaveLength(2);
  });
});

describe("CRM custom appointment selection", () => {
  const base = { startsAt: "2026-11-03T03:00:00Z", customer: null, source: "walk_in" };
  const customService = { name: "Repair", priceMinor: 100_000 };
  it("requires exactly one service definition and a bounded custom duration", () => {
    expect(createSalonBookingInputSchema.safeParse(base).success).toBe(false);
    expect(createSalonBookingInputSchema.safeParse({ ...base, customService }).success).toBe(false);
    for (const durationMinutes of [5, 75, 1440])
      expect(
        createSalonBookingInputSchema.safeParse({ ...base, customService, durationMinutes })
          .success,
      ).toBe(true);
    for (const durationMinutes of [0, 4, 1441, 10.5])
      expect(
        createSalonBookingInputSchema.safeParse({ ...base, customService, durationMinutes })
          .success,
      ).toBe(false);
    expect(
      createSalonBookingInputSchema.safeParse({
        ...base,
        customService,
        durationMinutes: 60,
        serviceId: SERVICE,
      }).success,
    ).toBe(false);
    expect(
      createSalonBookingInputSchema.safeParse({
        ...base,
        customService,
        durationMinutes: 60,
        nextServices: [{ serviceId: SERVICE }],
      }).success,
    ).toBe(false);
    expect(
      createSalonBookingInputSchema.safeParse({
        ...base,
        serviceId: SERVICE,
        durationMinutes: 60,
        nextServices: [{ serviceId: SERVICE }],
      }).success,
    ).toBe(false);
  });
  it("rejects invalid ad hoc prices and JSON query values", () => {
    for (const priceMinor of [-1, 0.5, 1_000_000_001])
      expect(
        createSalonBookingInputSchema.safeParse({
          ...base,
          customService: { ...customService, priceMinor },
          durationMinutes: 60,
        }).success,
      ).toBe(false);
    const q = { from: "2026-11-01", to: "2026-11-01", durationMinutes: "60" };
    expect(
      availabilityQuerySchema.parse({ ...q, customService: JSON.stringify(customService) })
        .customService,
    ).toEqual(customService);
    expect(availabilityQuerySchema.safeParse({ ...q, customService: "{" }).success).toBe(false);
  });
});
