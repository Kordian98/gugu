// Suspension (topic 12 M12.6) reaches customer manage links, which sit outside the salon guard:
// reading still works, cancel and reschedule are refused with `salon.suspended`. TEST_DATABASE_URL.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { problemSchema, publicBookingCreatedSchema, SALON_SUSPENDED_ERROR } from "@gugu/contracts";
import { createBookableSalon, vnAt } from "../../../test/factories/booking";
import { bearerFor, testEmail } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { BookingsModule } from "./bookings.facade";
import { PublicBookingController } from "./http/public-booking.controller";

const DAY = 86_400_000;

describe("manage links on a suspended salon (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  const suspend = (salonId: string) =>
    request(http(app))
      .post(`/api/v1/admin/salons/${salonId}/suspend`)
      .set("authorization", admin)
      .send({ reason: "Security review test" })
      .expect(200);

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    // The manage-link routes are unrouted in the app (X23); mount them like bookings.int.test.ts.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BookingsModule],
      controllers: [PublicBookingController],
    }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    const user = await prisma.user.create({
      data: {
        email: testEmail("susp-admin"),
        emailVerifiedAt: new Date(),
        platformRole: "super_admin",
        profile: { create: {} },
      },
    });
    admin = await bearerFor(app, user.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it("customer manage links cannot cancel or reschedule on a suspended salon", async () => {
    const s = await createBookableSalon(prisma);
    const day = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
    const created = await request(http(app))
      .post(`/api/v1/public/salons/${s.slug}/bookings`)
      .set("idempotency-key", `sec-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        startsAt: vnAt(day, "10:00"),
        deviceId: `device-${randomUUID()}`,
        customer: { name: "Trần Thị Bình", phone: "0987 654 321" },
      })
      .expect(201);
    const { manageToken } = publicBookingCreatedSchema.parse(created.body);
    await suspend(s.salonId);

    // Reading still works (read-only rule); writes are refused.
    await request(http(app)).get(`/api/v1/public/bookings/${manageToken}`).expect(200);
    const cancel = await request(http(app))
      .post(`/api/v1/public/bookings/${manageToken}/cancel`)
      .send({});
    expect(cancel.status).toBe(403);
    expect(problemSchema.parse(cancel.body).code).toBe(SALON_SUSPENDED_ERROR);
    const reschedule = await request(http(app))
      .post(`/api/v1/public/bookings/${manageToken}/reschedule`)
      .send({ startsAt: vnAt(day, "14:00") });
    expect(reschedule.status).toBe(403);
    expect(problemSchema.parse(reschedule.body).code).toBe(SALON_SUSPENDED_ERROR);
    const booking = await prisma.booking.findFirstOrThrow({ where: { salonId: s.salonId } });
    expect(booking.status).toBe("confirmed");
    expect(booking.startsAt.toISOString()).toBe(vnAt(day, "10:00"));
  });
});
