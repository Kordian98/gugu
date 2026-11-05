import { describe, expect, it } from "vitest";
import type { Availability, Service } from "@gugu/contracts";

import { walkInNeedsRefresh, walkInOptions, walkInSlots } from "./quick-walk-in";

const service = {
  id: "service",
  isActive: true,
  price: 100_000,
  priceMax: 150_000,
  durationMinutes: 30,
  variants: [],
} as unknown as Service;

describe("quick walk-in choices", () => {
  it("drops the service range when a variant supplies a fixed price", () => {
    const choices = walkInOptions([
      {
        ...service,
        variants: [
          { id: "fixed", isActive: true, price: 200_000, priceMax: null, durationMinutes: null },
        ] as Service["variants"],
      },
    ]);
    expect(choices[0]?.price).toBe(200_000);
    expect(choices[0]?.priceMax).toBeNull();
  });

  it("requires server refresh after idle time or when the proposed start has passed", () => {
    const now = Date.parse("2026-11-05T03:00:00.000Z");
    expect(walkInNeedsRefresh(now, "2026-11-05T03:05:00.000Z", now)).toBe(false);
    expect(walkInNeedsRefresh(now - 30_001, "2026-11-05T03:05:00.000Z", now)).toBe(true);
    expect(walkInNeedsRefresh(now, "2026-11-05T03:00:00.000Z", now)).toBe(true);
  });
  it("never offers inactive services or silently chooses a priced variant", () => {
    const choices = walkInOptions([
      { ...service, isActive: false },
      {
        ...service,
        variants: [
          { id: "short", isActive: true, price: null, priceMax: null, durationMinutes: null },
          { id: "long", isActive: true, price: 200_000, priceMax: 250_000, durationMinutes: 60 },
          { id: "retired", isActive: false },
        ] as Service["variants"],
      },
    ]);
    expect(
      choices.map(({ key, price, durationMinutes }) => ({ key, price, durationMinutes })),
    ).toEqual([
      { key: "short", price: 100_000, durationMinutes: 30 },
      { key: "long", price: 200_000, durationMinutes: 60 },
    ]);
  });

  it("never substitutes tomorrow when today has no server slots", () => {
    const tomorrow = { startsAt: "2026-11-06T03:00:00.000Z", staffIds: ["staff"] };
    const result = {
      days: [
        { date: "2026-11-05", slots: [] },
        { date: "2026-11-06", slots: [tomorrow] },
      ],
    } as unknown as Availability;
    expect(walkInSlots(result, "2026-11-05")).toEqual([]);
    expect(walkInSlots(undefined, "2026-11-05")).toEqual([]);
    expect(walkInSlots(result, "2026-11-07")).toEqual([]);
  });

  it("preserves the server's slot ordering and staff preference", () => {
    const slots = [{ startsAt: "2026-11-05T03:00:00.000Z", staffIds: ["best", "other"] }];
    const result = { days: [{ date: "2026-11-05", slots }] } as unknown as Availability;
    expect(walkInSlots(result, "2026-11-05")).toBe(slots);
  });
});
