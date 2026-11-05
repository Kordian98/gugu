import type { Availability, Service } from "@gugu/contracts";

/** A variant is an explicit choice, never an unseen change of price or duration. */
export function walkInOptions(services: Service[]) {
  return services
    .filter((service) => service.isActive)
    .flatMap((service) => {
      const variants = service.variants.filter((variant) => variant.isActive);
      return (variants.length ? variants : [null]).map((variant) => ({
        key: variant?.id ?? service.id,
        service,
        variant,
        price: variant?.price ?? service.price,
        // A fixed variant price replaces the parent range (booking/terms.ts).
        priceMax: variant?.price != null ? variant.priceMax : service.priceMax,
        durationMinutes: variant?.durationMinutes ?? service.durationMinutes,
      }));
    });
}

export function walkInNeedsRefresh(updatedAt: number, startsAt: string, now: number) {
  return now - updatedAt > 30_000 || Date.parse(startsAt) <= now;
}

/** Only select among today's server-produced slots; never manufacture or roll to another day. */
export function walkInSlots(availability: Availability | undefined, today: string) {
  return availability?.days.find((day) => day.date === today)?.slots ?? [];
}
