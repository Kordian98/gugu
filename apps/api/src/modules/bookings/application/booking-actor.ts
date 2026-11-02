import { Injectable } from "@nestjs/common";
import type { SalonPermission } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

/** Who performs a booking command. Derived by the controllers, never from client input. */
export type BookingActor =
  | {
      kind: "salon_member";
      userId: string;
      /**
       * Set when the member only has the `.own` permission (staff role): every command is limited
       * to bookings of this staff profile (spec 05 §3.4, security review).
       */
      ownStaffId: string | null;
      /** `bookings.override_rules` — hours, lead time, window (q18). */
      canOverride: boolean;
      /** Owner/manager: no_show ↔ completed corrections. */
      canCorrect: boolean;
    }
  | { kind: "customer"; userId: string | null; deviceHash: string }
  | { kind: "system" };

export type SalonMemberActor = Extract<BookingActor, { kind: "salon_member" }>;

export const actorScope = (actor: BookingActor): string =>
  actor.kind === "salon_member"
    ? `user:${actor.userId}`
    : actor.kind === "customer"
      ? `device:${actor.deviceHash}`
      : "system";

const forbidden = () => new AppError(403, COMMON_ERRORS.forbidden, "Permission required");

/** Resolves a member's booking scope: full (`bookings.<x>`) or own (`bookings.<x>.own`). */
@Injectable()
export class BookingActors {
  constructor(private readonly prisma: PrismaService) {}

  /** Staff profile linked to the member, or null. */
  private async ownStaffProfile(salon: SalonContext, userId: string): Promise<string | null> {
    const profile = await this.prisma.staffProfile.findFirst({
      where: { salonId: salon.salonId, deletedAt: null, member: { userId } },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  private async scope(
    salon: SalonContext,
    userId: string,
    full: SalonPermission,
    own: SalonPermission,
  ): Promise<string | null> {
    if (salon.permissions.has(full)) return null;
    if (!salon.permissions.has(own)) throw forbidden();
    const staffId = await this.ownStaffProfile(salon, userId);
    if (!staffId) throw forbidden();
    return staffId;
  }

  async writer(salon: SalonContext, userId: string): Promise<SalonMemberActor> {
    return {
      kind: "salon_member",
      userId,
      ownStaffId: await this.scope(salon, userId, "bookings.write", "bookings.write.own"),
      canOverride: salon.permissions.has("bookings.override_rules"),
      canCorrect: salon.role === "owner" || salon.role === "manager",
    };
  }

  /** Staff id the reader is limited to, or null for the whole salon. */
  async readScope(salon: SalonContext, userId: string): Promise<string | null> {
    return this.scope(salon, userId, "bookings.read", "bookings.read.own");
  }
}
