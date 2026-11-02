import { Injectable } from "@nestjs/common";
import type { ClientSuggestion } from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

type Row = {
  name: string;
  phone: string;
  visits: bigint;
  no_shows: bigint;
  last_at: Date;
  service_id: string;
  variant_id: string | null;
  staff_id: string;
};

/**
 * Recent clients of this salon from its own bookings, newest first (07 M7.2 quick pick). Matches
 * phone digits ("0912…" also finds "+84912…") or a diacritic-insensitive part of the name.
 */
@Injectable()
export class ClientLookupQuery {
  constructor(private readonly prisma: PrismaService) {}

  async find(ctx: SalonContext, q: string): Promise<ClientSuggestion[]> {
    const digits = q
      .replace(/\D/g, "")
      .replace(/^0+/, "")
      .replace(/^84(?=\d{8,})/, "");
    const text = q.replace(/[%_\\]/g, "").trim();
    const phoneLike = digits.length >= 3 ? `%${digits}%` : null;
    const nameLike = text.length >= 2 && digits.length < 3 ? `%${text.toLowerCase()}%` : null;
    const any = phoneLike === null && nameLike === null;
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH per_phone AS (
        SELECT DISTINCT ON (b.customer_phone_e164)
          b.customer_name AS name,
          b.customer_phone_e164 AS phone,
          b.starts_at AS last_at,
          bs.service_id,
          bs.variant_id,
          b.staff_id,
          count(*) OVER (PARTITION BY b.customer_phone_e164) AS visits,
          count(*) FILTER (WHERE b.status = 'no_show') OVER (PARTITION BY b.customer_phone_e164) AS no_shows
        FROM bookings b
        JOIN booking_services bs ON bs.booking_id = b.id AND bs.salon_id = b.salon_id
        WHERE b.salon_id = ${ctx.salonId}::uuid
          AND b.customer_phone_e164 IS NOT NULL
          AND b.customer_name IS NOT NULL
          AND (
            ${any}
            OR (${phoneLike}::text IS NOT NULL AND b.customer_phone_e164 LIKE ${phoneLike})
            OR (${nameLike}::text IS NOT NULL AND unaccent(lower(b.customer_name)) LIKE unaccent(${nameLike}))
          )
        ORDER BY b.customer_phone_e164, b.starts_at DESC
      )
      SELECT * FROM per_phone ORDER BY last_at DESC LIMIT 8`;
    return rows.map((r) => ({
      name: r.name,
      phone: r.phone,
      visits: Number(r.visits),
      noShows: Number(r.no_shows),
      lastVisitAt: r.last_at.toISOString(),
      lastServiceId: r.service_id,
      lastVariantId: r.variant_id,
      lastStaffId: r.staff_id,
    }));
  }
}
