import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  type Availability,
  type AvailabilityQuery,
  availabilityQuerySchema,
  availabilitySchema,
  type CreateHoldInput,
  createHoldInputSchema,
  type CreatePublicBookingInput,
  createPublicBookingInputSchema,
  type Hold,
  holdSchema,
  problemSchema,
  type PublicBooking,
  publicBookingCreatedSchema,
  type PublicBookingCreated,
  publicBookingParamsSchema,
  publicBookingSchema,
  publicCancelInputSchema,
  publicRescheduleInputSchema,
  publicSalonParamsSchema,
} from "@gugu/contracts";
import { Public } from "../../../common/guards/auth-policy";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { RateLimitService } from "../../../infrastructure/rate-limit/rate-limit.service";
import { requestMeta } from "../../auth/auth.facade";
import { actorScope, type BookingActor } from "../application/booking-actor";
import { BookingLifecycleCommands } from "../application/booking-lifecycle.commands";
import { BookingQueries } from "../application/booking.queries";
import { CreateBookingCommand } from "../application/create-booking.command";
import { HoldsCommand } from "../application/holds.command";
import { BookingSecrets, requestHash } from "../infra/booking-secrets";
import { BookingContexts } from "./booking-contexts";
import { normalizedPhone } from "./phone";
import { PUBLIC_BOOKING_LIMITS } from "./rate-limits";

/**
 * NOT ROUTED (roadmap X23): kept for a future customer-facing surface once a Vietnamese legal
 * review allows it; integration tests mount it explicitly to keep the customer paths covered.
 *
 * The salon's own public booking page (X19: SaaS first — direct link, QR, Zalo link). Customers
 * book with name + phone, no OTP (X11); abuse is limited by rate limits per device/IP/phone, the
 * per-phone active limit (q15) and holds per device. Bot check (Turnstile) is not implemented yet.
 * The manage link (`/public/bookings/:token`) lets the customer view, cancel and reschedule.
 */
@ApiTags("public-booking")
@Controller("public")
export class PublicBookingController {
  constructor(
    private readonly contexts: BookingContexts,
    private readonly queries: BookingQueries,
    private readonly holds: HoldsCommand,
    private readonly create: CreateBookingCommand,
    private readonly lifecycle: BookingLifecycleCommands,
    private readonly secrets: BookingSecrets,
    private readonly rateLimits: RateLimitService,
  ) {}

  private async limit(
    rule: keyof typeof PUBLIC_BOOKING_LIMITS,
    subject: string | null,
  ): Promise<void> {
    if (subject) await this.rateLimits.consume(PUBLIC_BOOKING_LIMITS[rule], subject);
  }

  @Get("salons/:slug/availability")
  @Public()
  @ApiOperation({
    operationId: "publicBooking.availability",
    summary: "Bookable times on a salon's page.",
  })
  @ApiResponse({
    status: 200,
    description: "Slots per salon-local day.",
    standardSchema: availabilitySchema,
  })
  async availability(
    @Param({ schema: publicSalonParamsSchema }) p: { slug: string },
    @Query({ schema: availabilityQuerySchema }) query: AvailabilityQuery,
    @Req() req: Request,
  ): Promise<Availability> {
    await this.limit("availabilityPerIp", requestMeta(req).ipPrefix);
    const ctx = await this.contexts.forPublicSlug(p.slug);
    return this.queries.availability(ctx, query, { hideStaff: ctx.settings.hideStaffChoice });
  }

  @Post("salons/:slug/holds")
  @Public()
  @HttpCode(201)
  @ApiOperation({
    operationId: "publicBooking.hold",
    summary: "Hold a slot for a few minutes while the customer confirms.",
  })
  @ApiResponse({ status: 201, description: "Held.", standardSchema: holdSchema })
  @ApiResponse({ status: 409, description: "Slot taken.", standardSchema: problemSchema })
  async hold(
    @Param({ schema: publicSalonParamsSchema }) p: { slug: string },
    @Body({ schema: createHoldInputSchema }) body: CreateHoldInput,
    @Req() req: Request,
  ): Promise<Hold> {
    const deviceHash = this.secrets.deviceHash(body.deviceId);
    await this.limit("holdsPerDevice", deviceHash);
    await this.limit("holdsPerIp", requestMeta(req).ipPrefix);
    const ctx = await this.contexts.forPublicSlug(p.slug);
    return this.holds.create(ctx, deviceHash, {
      serviceId: body.serviceId,
      variantId: body.variantId ?? null,
      addOnIds: body.addOnIds,
      staffId: body.staffId ?? null,
      startsAt: new Date(body.startsAt),
    });
  }

  @Post("salons/:slug/bookings")
  @Public()
  @HttpCode(201)
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "Unique per booking attempt.",
  })
  @ApiOperation({
    operationId: "publicBooking.create",
    summary: "Book (name + phone, pay at the salon).",
  })
  @ApiResponse({ status: 201, description: "Booked.", standardSchema: publicBookingCreatedSchema })
  @ApiResponse({ status: 409, description: "Slot taken.", standardSchema: problemSchema })
  @ApiResponse({
    status: 429,
    description: "Rate or active-booking limit.",
    standardSchema: problemSchema,
  })
  async book(
    @Param({ schema: publicSalonParamsSchema }) p: { slug: string },
    @Body({ schema: createPublicBookingInputSchema }) body: CreatePublicBookingInput,
    @Headers("idempotency-key") key: string | undefined,
    @Req() req: Request,
  ): Promise<PublicBookingCreated> {
    const deviceHash = this.secrets.deviceHash(body.deviceId);
    const phoneE164 = normalizedPhone(body.customer.phone);
    await this.limit("bookingsPerDevice", deviceHash);
    await this.limit("bookingsPerIp", requestMeta(req).ipPrefix);
    await this.limit("bookingsPerPhone", this.secrets.phoneHash(phoneE164));
    const ctx = await this.contexts.forPublicSlug(p.slug);
    const actor: BookingActor = { kind: "customer", userId: null, deviceHash };
    const { bookingId, manageToken } = await this.create.execute(
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
        customer: { name: body.customer.name, phoneE164 },
        note: body.note ?? null,
        overrides: [],
        overrideReason: null,
        holdId: body.holdId ?? null,
      },
      {
        scope: actorScope(actor),
        route: `POST /public/salons/${ctx.salonId}/bookings`,
        key,
        requestHash: requestHash(body),
      },
    );
    if (!manageToken) throw new Error("customer booking without manage token");
    return { booking: await this.queries.publicView(ctx, bookingId), manageToken };
  }

  private async manage(token: string) {
    const found = await this.queries.resolveManageToken(token);
    if (!found) throw new AppError(404, COMMON_ERRORS.notFound, "Link invalid or expired");
    const ctx = await this.contexts.forSalon(found.salonId);
    const actor: BookingActor = {
      kind: "customer",
      userId: null,
      deviceHash: this.secrets.deviceHash(`manage:${found.bookingId}`),
    };
    return { ctx, actor, bookingId: found.bookingId };
  }

  @Get("bookings/:token")
  @Public()
  @ApiOperation({
    operationId: "publicBooking.get",
    summary: "The customer's booking behind a manage link.",
  })
  @ApiResponse({ status: 200, description: "Booking.", standardSchema: publicBookingSchema })
  @ApiResponse({
    status: 404,
    description: "Invalid or expired link.",
    standardSchema: problemSchema,
  })
  async get(
    @Param({ schema: publicBookingParamsSchema }) p: { token: string },
    @Req() req: Request,
  ): Promise<PublicBooking> {
    await this.limit("manageLinkPerIp", requestMeta(req).ipPrefix);
    const { ctx, bookingId } = await this.manage(p.token);
    return this.queries.publicView(ctx, bookingId);
  }

  @Post("bookings/:token/cancel")
  @Public()
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "Unique per attempt." })
  @ApiOperation({
    operationId: "publicBooking.cancel",
    summary: "Customer cancels (until the cutoff, q14).",
  })
  @ApiResponse({
    status: 200,
    description: "Cancelled; the link is revoked.",
    standardSchema: publicBookingSchema,
  })
  @ApiResponse({ status: 409, description: "Cutoff passed.", standardSchema: problemSchema })
  async cancel(
    @Param({ schema: publicBookingParamsSchema }) p: { token: string },
    @Body({ schema: publicCancelInputSchema }) body: { reason?: string | null | undefined },
    @Headers("idempotency-key") key: string | undefined,
    @Req() req: Request,
  ): Promise<PublicBooking> {
    await this.limit("manageLinkPerIp", requestMeta(req).ipPrefix);
    const { ctx, actor, bookingId } = await this.manage(p.token);
    await this.lifecycle.transition(
      ctx,
      actor,
      bookingId,
      { to: "cancelled_by_customer", reason: body.reason ?? null },
      {
        scope: actorScope(actor),
        route: `POST /public/bookings/${bookingId}/cancel`,
        key,
        requestHash: requestHash(body),
      },
    );
    return this.queries.publicView(ctx, bookingId);
  }

  @Post("bookings/:token/reschedule")
  @Public()
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "Unique per attempt." })
  @ApiOperation({
    operationId: "publicBooking.reschedule",
    summary: "Customer moves the booking; returns a new manage link.",
  })
  @ApiResponse({ status: 200, description: "Moved.", standardSchema: publicBookingCreatedSchema })
  @ApiResponse({
    status: 409,
    description: "Slot taken or cutoff passed.",
    standardSchema: problemSchema,
  })
  async reschedule(
    @Param({ schema: publicBookingParamsSchema }) p: { token: string },
    @Body({ schema: publicRescheduleInputSchema }) body: { startsAt: string },
    @Headers("idempotency-key") key: string | undefined,
    @Req() req: Request,
  ): Promise<PublicBookingCreated> {
    await this.limit("manageLinkPerIp", requestMeta(req).ipPrefix);
    const { ctx, actor, bookingId } = await this.manage(p.token);
    const result = await this.lifecycle.reschedule(
      ctx,
      actor,
      bookingId,
      { startsAt: new Date(body.startsAt), overrides: [], overrideReason: null },
      {
        scope: actorScope(actor),
        route: `POST /public/bookings/${bookingId}/reschedule`,
        key,
        requestHash: requestHash(body),
      },
    );
    return {
      booking: await this.queries.publicView(ctx, bookingId),
      manageToken: result.manageToken ?? p.token,
    };
  }
}
