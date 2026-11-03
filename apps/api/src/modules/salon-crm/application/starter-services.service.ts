import { Injectable } from "@nestjs/common";
import type { StarterServicesInputParsed, StarterServicesResult } from "@gugu/contracts";
import type { SalonContext, UserPrincipal } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AnalyticsService } from "../../analytics/analytics.facade";
import { CatalogService } from "../../catalog/catalog.facade";

const nameKey = (n: string) => n.trim().toLocaleLowerCase("vi");

/**
 * Template services from the guided setup (07 §3.7 path B, ADR-0018), created through the catalogue
 * (validation, staff auto-assignment, availability bump, audit). A row whose Vietnamese name already
 * exists in the salon is skipped, so a retry or a double tap never duplicates the list.
 */
@Injectable()
export class StarterServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly analytics: AnalyticsService,
  ) {}

  async add(
    ctx: SalonContext,
    user: UserPrincipal,
    input: StarterServicesInputParsed,
  ): Promise<StarterServicesResult> {
    const existing = await this.prisma.service.findMany({
      where: { salonId: ctx.salonId, deletedAt: null },
      select: { name: true },
    });
    const taken = new Set(
      existing
        .map((s) => nameKey(((s.name ?? {}) as { vi?: string }).vi ?? ""))
        .filter((k) => k !== ""),
    );
    let created = 0;
    let skipped = 0;
    for (const item of input.items) {
      const k = nameKey(item.name.vi);
      if (taken.has(k)) {
        skipped += 1;
        continue;
      }
      await this.catalog.create(ctx, item);
      taken.add(k);
      created += 1;
    }
    await this.analytics.record({
      name: "starter_services_added",
      salonId: ctx.salonId,
      actorUserId: user.userId,
      props: { business_type: input.businessType, count: created },
    });
    return { created, skipped };
  }
}
