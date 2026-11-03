import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type Availability,
  type AvailabilityQuery,
  availabilityQuerySchema,
  availabilitySchema,
  type BookingCheck,
  type BookingCheckQuery,
  bookingCheckQuerySchema,
  bookingCheckSchema,
  earliestSlotsQuerySchema,
  earliestSlotsSchema,
  type EarliestSlots,
  type EarliestSlotsQuery,
  bookingParamsSchema,
  type CreateSalonBookingInput,
  createSalonBookingInputSchema,
  problemSchema,
  type RescheduleInput,
  rescheduleInputSchema,
  type SalonBooking,
  type SalonBookingListQuery,
  salonBookingListQuerySchema,
  salonBookingListSchema,
  salonBookingSchema,
  salonParamsSchema,
  type TransitionInput,
  transitionInputSchema,
} from "@gugu/contracts";
import { RequirePermission } from "../../../common/guards/auth-policy";
import {
  CurrentSalon,
  CurrentUser,
  type SalonContext,
  type UserPrincipal,
} from "../../../common/guards/principal";
import { actorScope, BookingActors } from "../application/booking-actor";
import { BookingLifecycleCommands } from "../application/booking-lifecycle.commands";
import { BookingQueries } from "../application/booking.queries";
import { CreateBookingCommand } from "../application/create-booking.command";
import { requestHash } from "../infra/booking-secrets";
import { BookingContexts } from "./booking-contexts";
import { normalizedPhone } from "./phone";
import { withPhoneVisibility } from "./phone-visibility";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  description: "Unique per request (8–128 chars). Retries with the same key replay the result.",
};

/**
 * CRM booking endpoints (topic 06). Routes are gated by `schedules.read` (every salon role); the
 * service then applies the booking scope: full (`bookings.read`/`bookings.write`) or own calendar
 * only (`.own`, staff role). Bookings entered here are confirmed by the entry itself (X9 class 2).
 */
@ApiTags("bookings")
@Controller("salons/:salonId")
export class SalonBookingsController {
  constructor(
    private readonly contexts: BookingContexts,
    private readonly actors: BookingActors,
    private readonly queries: BookingQueries,
    private readonly create: CreateBookingCommand,
    private readonly lifecycle: BookingLifecycleCommands,
  ) {}

  @Get("availability")
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "bookings.salonAvailability",
    summary: "Bookable start times (CRM).",
  })
  @ApiResponse({
    status: 200,
    description: "Slots per salon-local day.",
    standardSchema: availabilitySchema,
  })
  async availability(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: availabilityQuerySchema }) query: AvailabilityQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<Availability> {
    // Same scope as the other booking routes: staff with `.own` see only their own calendar.
    const scope = await this.actors.readScope(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    return this.queries.availability(ctx, query, { hideStaff: false, onlyStaffId: scope });
  }

  @Get("availability/earliest")
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "bookings.salonEarliestSlots",
    summary: "Earliest bookable start times across the booking window (CRM).",
  })
  @ApiResponse({
    status: 200,
    description: "First free options, at most `perDay` per day.",
    standardSchema: earliestSlotsSchema,
  })
  async earliest(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: earliestSlotsQuerySchema }) query: EarliestSlotsQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<EarliestSlots> {
    const scope = await this.actors.readScope(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    return this.queries.earliest(ctx, query, { onlyStaffId: scope });
  }

  @Get("booking-check")
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "bookings.check",
    summary:
      "Is this start bookable? If not, which audited overrides (hours, lead time, window) would allow it.",
  })
  @ApiResponse({ status: 200, description: "Check result.", standardSchema: bookingCheckSchema })
  async check(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: bookingCheckQuerySchema }) query: BookingCheckQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<BookingCheck> {
    const actor = await this.actors.writer(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    return this.queries.check(ctx, actor, query);
  }

  @Get("bookings")
  @RequirePermission("schedules.read")
  @ApiOperation({
    operationId: "bookings.list",
    summary: "Bookings starting in a date range (≤ 31 days).",
  })
  @ApiResponse({ status: 200, description: "Bookings.", standardSchema: salonBookingListSchema })
  async list(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Query({ schema: salonBookingListQuerySchema }) query: SalonBookingListQuery,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<{ items: SalonBooking[] }> {
    const scope = await this.actors.readScope(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    return {
      items: (await this.queries.list(ctx, query, scope)).map((b) => withPhoneVisibility(salon, b)),
    };
  }

  @Get("bookings/:bookingId")
  @RequirePermission("schedules.read")
  @ApiOperation({ operationId: "bookings.get", summary: "One booking." })
  @ApiResponse({ status: 200, description: "Booking.", standardSchema: salonBookingSchema })
  @ApiResponse({ status: 404, description: "Not found.", standardSchema: problemSchema })
  async get(
    @Param({ schema: bookingParamsSchema }) p: { salonId: string; bookingId: string },
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SalonBooking> {
    const scope = await this.actors.readScope(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    return withPhoneVisibility(salon, await this.queries.get(ctx, p.bookingId, scope));
  }

  @Post("bookings")
  @RequirePermission("schedules.read")
  @HttpCode(201)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    operationId: "bookings.create",
    summary: "Enter a booking (phone, walk-in, Zalo chat, other). Revalidated server-side.",
  })
  @ApiResponse({ status: 201, description: "Created.", standardSchema: salonBookingSchema })
  @ApiResponse({ status: 409, description: "Slot taken.", standardSchema: problemSchema })
  async createBooking(
    @Param({ schema: salonParamsSchema }) _p: { salonId: string },
    @Body({ schema: createSalonBookingInputSchema }) body: CreateSalonBookingInput,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SalonBooking> {
    const actor = await this.actors.writer(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    const { bookingId } = await this.create.execute(
      ctx,
      actor,
      {
        source: body.source,
        selection: {
          serviceId: body.serviceId,
          variantId: body.variantId ?? null,
          addOnIds: body.addOnIds,
          staffId: body.staffId ?? null,
          startsAt: new Date(body.startsAt),
        },
        customer: body.customer
          ? {
              name: body.customer.name,
              phoneE164: normalizedPhone(body.customer.phone),
              email: body.customer.email ?? null,
            }
          : null,
        note: body.note ?? null,
        overrides: body.overrides,
        overrideReason: body.overrideReason ?? null,
        holdId: null,
      },
      {
        scope: actorScope(actor),
        route: `POST /salons/${salon.salonId}/bookings`,
        key,
        requestHash: requestHash(body),
      },
    );
    return withPhoneVisibility(salon, await this.queries.get(ctx, bookingId, null));
  }

  @Post("bookings/:bookingId/transitions")
  @RequirePermission("schedules.read")
  @HttpCode(200)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    operationId: "bookings.transition",
    summary: "Confirm, check in, complete, cancel, mark no-show (state machine, spec 06 §3.7).",
  })
  @ApiResponse({ status: 200, description: "Updated booking.", standardSchema: salonBookingSchema })
  @ApiResponse({ status: 409, description: "Not allowed now.", standardSchema: problemSchema })
  async transition(
    @Param({ schema: bookingParamsSchema }) p: { salonId: string; bookingId: string },
    @Body({ schema: transitionInputSchema }) body: TransitionInput,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SalonBooking> {
    const actor = await this.actors.writer(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    await this.lifecycle.transition(
      ctx,
      actor,
      p.bookingId,
      { to: body.to, reason: body.reason ?? null },
      {
        scope: actorScope(actor),
        route: `POST /salons/${salon.salonId}/bookings/${p.bookingId}/transitions`,
        key,
        requestHash: requestHash(body),
      },
    );
    return withPhoneVisibility(salon, await this.queries.get(ctx, p.bookingId, null));
  }

  @Post("bookings/:bookingId/reschedule")
  @RequirePermission("schedules.read")
  @HttpCode(200)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    operationId: "bookings.reschedule",
    summary: "Move a booking (same id, revalidated).",
  })
  @ApiResponse({ status: 200, description: "Updated booking.", standardSchema: salonBookingSchema })
  @ApiResponse({
    status: 409,
    description: "Slot taken or not movable.",
    standardSchema: problemSchema,
  })
  async reschedule(
    @Param({ schema: bookingParamsSchema }) p: { salonId: string; bookingId: string },
    @Body({ schema: rescheduleInputSchema }) body: RescheduleInput,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentSalon() salon: SalonContext,
    @CurrentUser() user: UserPrincipal,
  ): Promise<SalonBooking> {
    const actor = await this.actors.writer(salon, user.userId);
    const ctx = await this.contexts.forSalon(salon.salonId);
    await this.lifecycle.reschedule(
      ctx,
      actor,
      p.bookingId,
      {
        startsAt: new Date(body.startsAt),
        ...(body.staffId !== undefined ? { staffId: body.staffId } : {}),
        overrides: body.overrides,
        overrideReason: body.overrideReason ?? null,
      },
      {
        scope: actorScope(actor),
        route: `POST /salons/${salon.salonId}/bookings/${p.bookingId}/reschedule`,
        key,
        requestHash: requestHash(body),
      },
    );
    return withPhoneVisibility(salon, await this.queries.get(ctx, p.bookingId, null));
  }
}
