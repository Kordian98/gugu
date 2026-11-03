import { Injectable } from "@nestjs/common";
import type { ClientSuggestion } from "@gugu/contracts";
import { maskPhone } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { CrmScope } from "./crm-scope";

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
 * phone digits ("0912…" also finds "+84912…") or a diacritic-insensitive part of the name. With
 * an own scope (staff role) only clients of the member's own bookings are visible.
 */
@Injectable()
export class ClientLookupQuery {
  constructor(private readonly prisma: PrismaService) {}

  async find(ctx: SalonContext, scope: CrmScope, q: string): Promise<ClientSuggestion[]> {
    const showPhone = ctx.permissions.has("customers.phone.read");
    const ownStaff = scope.staffId;
    const digits = q
      .replace(/\D/g, "")
      .replace(/^0+/, "")
      .replace(/^84(?=\d{8,})/, "");
    const text = q.replace(/[%_\\]/g, "").trim();
    // Without phone access, digit search is off too (it would let a member probe numbers).
    const phoneLike = showPhone && digits.length >= 3 ? `%${digits}%` : null;
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
        -- First line only: a multi-service booking (M6.8) is one visit.
        JOIN booking_services bs
          ON bs.booking_id = b.id AND bs.salon_id = b.salon_id AND bs.sequence = 1
        WHERE b.salon_id = ${ctx.salonId}::uuid
          AND (${ownStaff}::uuid IS NULL OR b.staff_id = ${ownStaff}::uuid)
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
      phone: showPhone ? r.phone : maskPhone(r.phone),
      phoneMasked: !showPhone,
      visits: Number(r.visits),
      noShows: Number(r.no_shows),
      lastVisitAt: r.last_at.toISOString(),
      lastServiceId: r.service_id,
      lastVariantId: r.variant_id,
      lastStaffId: r.staff_id,
    }));
  }
}
