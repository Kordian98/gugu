// Load test (topic 06): 50 concurrent booking writes across 5 staff, in-process HTTP against the
// local stack. Checks correctness under contention (exact winners, no overlaps, no 5xx, no
// deadlocks) and prints latency. Run alone: `pnpm --filter @gugu/api test:load`.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { BookingClock } from "./application/booking-clock";
import { BookingsModule } from "./bookings.facade";

const DAY = "2026-12-03";
const clock = { now: () => new Date("2026-12-01T08:00:00+07:00") };
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

interface Result {
  status: number;
  ms: number;
  code?: string | undefined;
}

function summary(label: string, results: Result[], wallMs: number) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.ceil(ms.length * p) - 1)] ?? 0;
  const by = (s: number) => results.filter((r) => r.status === s).length;
  console.log(
    `[load] ${label}: ${String(results.length)} writes in ${wallMs.toFixed(0)} ms ` +
      `(${(results.length / (wallMs / 1000)).toFixed(0)}/s) · 201=${String(by(201))} 200=${String(by(200))} ` +
      `409=${String(by(409))} 5xx=${String(results.filter((r) => r.status >= 500).length)} · ` +
      `p50 ${q(0.5).toFixed(0)} ms, p95 ${q(0.95).toFixed(0)} ms, max ${q(1).toFixed(0)} ms`,
  );
}

describe("booking writes under load (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;

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
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
    // 5 staff in total.
    for (let i = 0; i < 3; i++) {
      const staff = await prisma.staffProfile.create({
        data: { salonId: s.salonId, displayName: `Load ${String(i)}`, sortOrder: i + 2 },
      });
      s.staffIds.push(staff.id);
      await prisma.staffSchedule.createMany({
        data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          salonId: s.salonId,
          staffId: staff.id,
          weekday,
          startsAt: time("09:00"),
          endsAt: time("18:00"),
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        })),
      });
      await prisma.staffService.create({
        data: { salonId: s.salonId, staffId: staff.id, serviceId: s.serviceId },
      });
    }
    expect(s.staffIds).toHaveLength(5);
  });
  afterAll(async () => {
    await app.close();
  });

  const timed = async (fn: () => request.Test): Promise<Result> => {
    const t0 = performance.now();
    const res = await fn();
    return {
      status: res.status,
      ms: performance.now() - t0,
      code: (res.body as { code?: string }).code,
    };
  };
  const create = (staffId: string | null, startsAt: string) =>
    timed(() =>
      request(http(app))
        .post(`/api/v1/salons/${s.salonId}/bookings`)
        .set("authorization", owner)
        .set("idempotency-key", `k-${randomUUID()}`)
        .send({
          serviceId: s.serviceId,
          staffId,
          startsAt,
          customer: {
            name: "Load",
            phone: `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
          },
          source: "phone",
        }),
    );
  const overlaps = async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM booking_occupancy a JOIN booking_occupancy b
        ON a.id < b.id AND a.period && b.period
       AND (a.staff_id = b.staff_id OR a.resource_unit_id = b.resource_unit_id)
      WHERE a.active AND b.active AND a.salon_id = ${s.salonId}::uuid`;
    return Number(rows[0]?.n);
  };
  const run = async (label: string, jobs: (() => Promise<Result>)[]) => {
    const t0 = performance.now();
    const results = await Promise.all(jobs.map((j) => j()));
    summary(label, results, performance.now() - t0);
    expect(results.filter((r) => r.status >= 500)).toEqual([]);
    for (const r of results.filter((x) => x.status === 409))
      expect(r.code).toBe("booking.slot_taken");
    expect(await overlaps()).toBe(0);
    return results;
  };

  it("A: 50 writes, 5 staff × 5 times, every pair contested twice → exactly 25 bookings", async () => {
    const times = ["09:00", "10:00", "11:00", "13:00", "14:00"];
    const jobs = Array.from(
      { length: 50 },
      (_, i) => () =>
        create(s.staffIds[i % 5] ?? null, vnAt(DAY, times[Math.floor(i / 5) % 5] ?? "09:00")),
    );
    const results = await run("A staff × time", jobs);
    expect(results.filter((r) => r.status === 201)).toHaveLength(25);
  });

  it("B: 50 any-staff writes at 5 times with a 2-unit bed required → exactly 2 per time", async () => {
    const type = await prisma.resourceType.create({ data: { salonId: s.salonId, name: "Giường" } });
    const bed = await prisma.resource.create({
      data: { salonId: s.salonId, resourceTypeId: type.id, name: "Giường" },
    });
    await prisma.resourceUnit.createMany({
      data: [1, 2].map((position) => ({ salonId: s.salonId, resourceId: bed.id, position })),
    });
    await prisma.serviceResourceRequirement.create({
      data: { salonId: s.salonId, serviceId: s.serviceId, resourceTypeId: type.id },
    });
    const times = ["15:00", "15:45", "16:30", "17:00", "17:15"];
    const jobs = Array.from(
      { length: 50 },
      (_, i) => () => create(null, vnAt(DAY, times[i % 5] ?? "15:00")),
    );
    const results = await run("B any staff + 2 beds", jobs);
    // 15:00 and 15:45 get 2 each. 16:30, 17:00 and 17:15 form an overlap chain (40 min claims):
    // depending on who wins the race, the chain holds 2–4 bookings. The bed limit itself is checked
    // by the overlap query in run().
    const won = results.filter((r) => r.status === 201).length;
    expect(won).toBeGreaterThanOrEqual(6);
    expect(won).toBeLessThanOrEqual(8);
  });

  it("C: 50 mixed writes — reschedules of 10 bookings racing new bookings for the same slots", async () => {
    const day = "2026-12-04";
    // Staff-only service for this scenario (B added a bed requirement).
    await prisma.serviceResourceRequirement.deleteMany({ where: { serviceId: s.serviceId } });
    const existing: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(http(app))
        .post(`/api/v1/salons/${s.salonId}/bookings`)
        .set("authorization", owner)
        .set("idempotency-key", `k-${randomUUID()}`)
        .send({
          serviceId: s.serviceId,
          staffId: s.staffIds[i % 5],
          startsAt: vnAt(day, i < 5 ? "09:00" : "10:00"),
          customer: { name: "Seed", phone: `09${String(20_000_000 + i)}` },
          source: "phone",
        })
        .expect(201);
      existing.push((res.body as { id: string }).id);
    }
    const targets = ["13:00", "14:00", "15:00"];
    const jobs: (() => Promise<Result>)[] = [];
    for (let i = 0; i < 25; i++) {
      const id = existing[i % 10] ?? "";
      const target = vnAt(day, targets[i % 3] ?? "13:00");
      jobs.push(() =>
        timed(() =>
          request(http(app))
            .post(`/api/v1/salons/${s.salonId}/bookings/${id}/reschedule`)
            .set("authorization", owner)
            .set("idempotency-key", `k-${randomUUID()}`)
            .send({ startsAt: target }),
        ),
      );
      jobs.push(() => create(s.staffIds[i % 5] ?? null, target));
    }
    const results = await run("C reschedule vs create", jobs);
    // Each booking ended in exactly one place (one staff claim, never duplicated or lost).
    for (const id of existing) {
      expect(await prisma.bookingOccupancy.count({ where: { bookingId: id, active: true } })).toBe(
        1,
      );
    }
    expect(results.filter((r) => r.status === 201 || r.status === 200).length).toBeGreaterThan(0);
  });
});
