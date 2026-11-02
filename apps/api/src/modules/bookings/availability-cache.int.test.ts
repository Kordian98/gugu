// Integration against the local stack: availability cache (topic 06 M6.7) — freshness after
// booking writes and settings changes, plus the month-view benchmark (10 staff, 3 resource types).
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Availability, availabilitySchema } from "@gugu/contracts";
import {
  type BookableSalonFixture,
  createBookableSalon,
  vnAt,
} from "../../../test/factories/booking";
import { bearerFor } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { BookingClock } from "./application/booking-clock";
import { BookingsModule } from "./bookings.facade";

const DAY = "2026-12-02";
const now = new Date("2026-12-01T08:00:00+07:00");
const clock = { now: () => new Date(now) };
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

describe("availability cache (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, BookingsModule] })
      .overrideProvider(BookingClock)
      .useValue(clock)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const availability = async (s: BookableSalonFixture, auth: string, q: Record<string, string>) =>
    availabilitySchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/availability`)
          .query({ serviceId: s.serviceId, ...q })
          .set("authorization", auth)
          .expect(200)
      ).body,
    );
  const starts = (a: Availability) => a.days.flatMap((d) => d.slots.map((x) => x.startsAt));

  it("is fresh after bookings, cancellations and settings changes within the same minute", async () => {
    const s = await createBookableSalon(prisma);
    const owner = await bearerFor(app, s.ownerUserId);
    const q = { staffId: s.staffIds[0], from: DAY, to: DAY };
    expect(starts(await availability(s, owner, q))).toContain(vnAt(DAY, "10:00"));
    const keys = await app.get(RedisService).client.keys(`avail:v1:${s.salonId}:*`);
    expect(keys.length).toBe(1);

    const created = await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "10:00"),
        customer: { name: "An", phone: "0912 345 678" },
        source: "phone",
      })
      .expect(201);
    expect(starts(await availability(s, owner, q))).not.toContain(vnAt(DAY, "10:00"));

    await request(http(app))
      .post(
        `/api/v1/salons/${s.salonId}/bookings/${(created.body as { id: string }).id}/transitions`,
      )
      .set("authorization", owner)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send({ to: "cancelled_by_salon" })
      .expect(200);
    expect(starts(await availability(s, owner, q))).toContain(vnAt(DAY, "10:00"));

    // A holiday (settings write → availability_version) empties the day.
    await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/settings/holidays`)
      .set("authorization", owner)
      .send({ startDate: DAY, endDate: DAY, closed: true })
      .expect(201);
    expect(starts(await availability(s, owner, q))).toEqual([]);
  });

  it("benchmark: month view, 10 staff, 3 resource types — p95 cold and warm", async () => {
    const s = await createBookableSalon(prisma);
    const owner = await bearerFor(app, s.ownerUserId);
    const { salonId } = s;
    // 8 more staff (10 total), all doing the service, 09:00–18:00 every day.
    for (let i = 0; i < 8; i++) {
      const staff = await prisma.staffProfile.create({
        data: { salonId, displayName: `Staff ${String(i)}`, sortOrder: i + 2 },
      });
      s.staffIds.push(staff.id);
      await prisma.staffSchedule.createMany({
        data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          salonId,
          staffId: staff.id,
          weekday,
          startsAt: time("09:00"),
          endsAt: time("18:00"),
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        })),
      });
      await prisma.staffService.create({
        data: { salonId, staffId: staff.id, serviceId: s.serviceId },
      });
    }
    // 3 resource types (beds ×3, chairs ×4, rooms ×2); the service needs one of each.
    for (const [name, capacity] of [
      ["Giường", 3],
      ["Ghế", 4],
      ["Phòng", 2],
    ] as const) {
      const type = await prisma.resourceType.create({ data: { salonId, name } });
      const resource = await prisma.resource.create({
        data: { salonId, resourceTypeId: type.id, name },
      });
      await prisma.resourceUnit.createMany({
        data: Array.from({ length: capacity }, (_, i) => ({
          salonId,
          resourceId: resource.id,
          position: i + 1,
        })),
      });
      await prisma.serviceResourceRequirement.create({
        data: { salonId, serviceId: s.serviceId, resourceTypeId: type.id },
      });
    }
    // ~120 bookings spread over the month.
    let created = 0;
    for (let d = 2; d <= 31 && created < 120; d++) {
      const date = `2026-12-${String(d).padStart(2, "0")}`;
      for (const hh of ["09:00", "11:00", "14:00", "16:00"]) {
        const res = await request(http(app))
          .post(`/api/v1/salons/${salonId}/bookings`)
          .set("authorization", owner)
          .set("idempotency-key", `k-${randomUUID()}`)
          .send({
            serviceId: s.serviceId,
            staffId: null,
            startsAt: vnAt(date, hh),
            customer: { name: "Bench", phone: `09${String(10_000_000 + created).slice(0, 8)}` },
            source: "phone",
          });
        if (res.status === 201) created++;
      }
    }
    expect(created).toBeGreaterThan(100);

    const month = { from: "2026-12-01", to: "2026-12-31" };
    const run = async (bust: boolean) => {
      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        // Bust by bumping the occupancy generation (what every booking write does).
        if (bust) await app.get(RedisService).client.incr(`avail:occ:${salonId}`);
        const t0 = performance.now();
        const res = await availability(s, owner, month);
        samples.push(performance.now() - t0);
        expect(res.days.length).toBeGreaterThan(25);
      }
      return p95(samples);
    };
    const cold = await run(true);
    const warm = await run(false);
    console.log(
      `[bench] month view, 10 staff, 3 resource types, ${String(created)} bookings: p95 cold ${cold.toFixed(1)} ms, warm ${warm.toFixed(1)} ms`,
    );
    expect(cold).toBeLessThan(400); // measured locally: ~60 ms
    expect(warm).toBeLessThan(60); // measured locally: ~16 ms (HTTP + auth included)
  }, 120_000);
});
