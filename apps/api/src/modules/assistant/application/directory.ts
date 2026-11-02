import { Injectable } from "@nestjs/common";
import type { SalonPermission } from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { Directory } from "../firewall/scrubber";
import type { TokenVault } from "../firewall/token-vault";

const CUSTOMER_LOOKBACK_DAYS = 180;
const MAX_CUSTOMER_NAMES = 2_000;

/**
 * Names the firewall must recognise (never sent anywhere), and display names for re-hydration.
 * Display names respect the viewer's permissions: without `members.read` staff show as "Staff #3".
 */
@Injectable()
export class AssistantDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async load(salonId: string): Promise<Directory> {
    const since = new Date(Date.now() - CUSTOMER_LOOKBACK_DAYS * 24 * 3600_000);
    const [salon, staff, customers] = await Promise.all([
      this.prisma.salon.findUniqueOrThrow({ where: { id: salonId }, select: { name: true } }),
      this.prisma.staffProfile.findMany({
        where: { salonId },
        select: { id: true, displayName: true },
      }),
      this.prisma.booking.findMany({
        where: { salonId, createdAt: { gte: since }, customerName: { not: null } },
        select: { customerName: true },
        distinct: ["customerName"],
        take: MAX_CUSTOMER_NAMES,
      }),
    ]);
    return {
      staff: staff.map((s) => ({ id: s.id, name: s.displayName })),
      customers: customers.map((c) => c.customerName ?? "").filter(Boolean),
      salon: [salonName(salon.name)].filter(Boolean),
    };
  }

  /** token → what the viewer sees. */
  async displayNames(
    salonId: string,
    vault: TokenVault,
    permissions: ReadonlySet<SalonPermission>,
    locale: "vi" | "en",
  ): Promise<Map<string, string>> {
    const entries = vault.entries();
    const ids = (kind: string) => entries.filter((e) => e.kind === kind).map((e) => e.id);
    const [staff, services, bookings] = await Promise.all([
      permissions.has("members.read")
        ? this.prisma.staffProfile.findMany({
            where: { salonId, id: { in: ids("staff") } },
            select: { id: true, displayName: true },
          })
        : Promise.resolve([]),
      this.prisma.service.findMany({
        where: { salonId, id: { in: ids("service") } },
        select: { id: true, name: true },
      }),
      this.prisma.booking.findMany({
        where: { salonId, id: { in: ids("booking") } },
        select: { id: true, referenceCode: true },
      }),
    ]);
    const staffName = new Map(staff.map((s) => [s.id, s.displayName]));
    const serviceName = new Map(
      services.map((s) => {
        const n = (s.name ?? {}) as Partial<Record<"vi" | "en", string>>;
        return [s.id, n[locale] || n.vi || ""];
      }),
    );
    const bookingRef = new Map(bookings.map((b) => [b.id, `#${b.referenceCode}`]));
    const label = {
      vi: { staff: "Nhân viên", service: "Dịch vụ" },
      en: { staff: "Staff", service: "Service" },
    }[locale];
    const out = new Map<string, string>();
    for (const e of entries) {
      const n = e.token.split("_")[1] ?? "";
      if (e.kind === "staff") out.set(e.token, staffName.get(e.id) ?? `${label.staff} #${n}`);
      else if (e.kind === "service")
        out.set(e.token, serviceName.get(e.id) || `${label.service} #${n}`);
      else out.set(e.token, bookingRef.get(e.id) ?? `#${n}`);
    }
    return out;
  }
}

function salonName(name: unknown): string {
  if (typeof name === "string") return name;
  const n = (name ?? {}) as Partial<Record<"vi" | "en", string>>;
  return n.vi ?? n.en ?? "";
}
