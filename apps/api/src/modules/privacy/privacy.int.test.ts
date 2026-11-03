// Privacy tools (topic 05 step 8) against the local stack, on TEST_DATABASE_URL only: owner-only
// client export and erasure (bookings, notes, Zalo, notification log), salon-wide async export,
// tenant isolation (another salon's client/export → 404, same phone in another salon untouched),
// the append-only status-history exception, and the retention purge.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clientEraseResultSchema,
  clientExportResultSchema,
  customerListSchema,
  PRIVACY_ERRORS,
  problemSchema,
  salonBookingSchema,
  salonExportDownloadSchema,
  salonExportListSchema,
  salonExportSchema,
  SALON_SUSPENDED_ERROR,
} from "@gugu/contracts";
import {
  type BookableSalonFixture,
  createBookableSalon,
  vnAt,
} from "../../../test/factories/booking";
import { addSalonMember, bearerFor } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { AppConfig } from "../../infrastructure/config/app-config";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../infrastructure/queue/queue.service";
import { QUEUES } from "../../infrastructure/queue/queues";
import { RetentionService, SalonExportService } from "./privacy.facade";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** VN calendar day `n` days from today (YYYY-MM-DD). */
const vnDay = (n: number) => new Date(Date.now() + 7 * HOUR + n * DAY).toISOString().slice(0, 10);

describe("privacy tools (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: BookableSalonFixture;
  let b: BookableSalonFixture;
  let ownerA: string;
  let ownerB: string;
  /** Each seeded client books on its own day so slots never collide. */
  let slot = 0;

  const api = (method: "get" | "post" | "patch", path: string, bearer: string, body?: object) => {
    const r = request(http(app))[method](`/api/v1/${path}`).set("authorization", bearer);
    return body ? r.send(body) : r;
  };
  const randomPhone = () => {
    const digits = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
    return { local: `090${digits}`, e164: `+8490${digits}` };
  };
  const book = (
    salon: BookableSalonFixture,
    bearer: string,
    phone: string,
    day: number,
    at: string,
  ) =>
    api("post", `salons/${salon.salonId}/bookings`, bearer, {
      serviceId: salon.serviceId,
      staffId: salon.staffIds[0],
      startsAt: vnAt(vnDay(day), at),
      customer: {
        name: "Trần Thu Hà",
        phone,
        email: "ha.privacy@test.gugu.local",
        note: "Da nhạy cảm",
      },
      source: "phone",
    })
      .set("idempotency-key", `k-${randomUUID()}`)
      .expect(201)
      .then((r) => (r.body as { id: string }).id);
  /** The client profile id the CRM shows for a phone (materialised from bookings). */
  const profileFor = async (salon: BookableSalonFixture, bearer: string, e164: string) => {
    const list = customerListSchema.parse(
      (
        await api("get", `salons/${salon.salonId}/customers?q=${e164.slice(-7)}`, bearer).expect(
          200,
        )
      ).body,
    );
    const hit = list.items.find((c) => c.phone === e164);
    if (!hit) throw new Error("client not materialised");
    return hit.id;
  };

  /** A client with an upcoming and a past (completed) booking, a stored email, a note and a Zalo chat. */
  const seedClient = async (salon: BookableSalonFixture, bearer: string) => {
    const phone = randomPhone();
    slot += 1;
    const upcoming = await book(salon, bearer, phone.local, 2 + slot, "10:00");
    const past = await book(salon, bearer, phone.local, 2 + slot, "11:00");
    await prisma.booking.update({
      where: { id: past },
      data: {
        startsAt: new Date(Date.now() - 10 * DAY),
        endsAt: new Date(Date.now() - 10 * DAY + 30 * 60_000),
        status: "completed",
        cancellationReason: "Khách gọi điện",
      },
    });
    await prisma.bookingStatusHistory.create({
      data: {
        salonId: salon.salonId,
        bookingId: past,
        fromStatus: "confirmed",
        toStatus: "completed",
        actorType: "salon_member",
        reasonText: "Chị Hà đến muộn",
      },
    });
    const profileId = await profileFor(salon, bearer, phone.e164);
    // q87: the email is stored on the profile (never used for sending).
    const email = `ha.${phone.local}@example.vn`;
    await api("patch", `salons/${salon.salonId}/customers/${profileId}`, bearer, {
      email,
    }).expect(204);
    await api("post", `salons/${salon.salonId}/customers/${profileId}/notes`, bearer, {
      body: "Dị ứng tinh dầu",
    }).expect(204);
    const conv = await prisma.zaloConversation.create({
      data: {
        salonId: salon.salonId,
        oaId: `oa-${randomUUID()}`,
        zaloUserId: `zu-${randomUUID()}`,
        displayName: "Hà Trần",
        phoneE164: phone.e164,
      },
    });
    await prisma.zaloMessage.createMany({
      data: [
        {
          salonId: salon.salonId,
          conversationId: conv.id,
          direction: "inbound",
          sender: "customer",
          kind: "text",
          text: "Cho em đặt lịch",
        },
        {
          salonId: salon.salonId,
          conversationId: conv.id,
          direction: "outbound",
          sender: "bot",
          kind: "text",
          text: "Dạ vâng",
        },
      ],
    });
    await prisma.zaloWebhookEvent.create({
      data: {
        eventKey: `ev-${randomUUID()}`,
        oaId: conv.oaId,
        salonId: salon.salonId,
        eventName: "user_send_text",
        // Already processed: the Zalo suite's drain() replays every `received` event in the DB.
        status: "processed",
        payload: {
          event_name: "user_send_text",
          sender: { id: conv.zaloUserId },
          recipient: { id: conv.oaId },
          message: { text: "Cho em đặt lịch" },
        },
        occurredAt: new Date(),
      },
    });
    return { phone, upcoming, past, profileId, conv, email };
  };

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    a = await createBookableSalon(prisma);
    b = await createBookableSalon(prisma);
    ownerA = await bearerFor(app, a.ownerUserId);
    ownerB = await bearerFor(app, b.ownerUserId);
  });

  beforeEach(async () => {
    await clearRateLimits(app);
  });

  afterAll(async () => {
    await app.get(QueueService).queue(QUEUES.privacy).obliterate({ force: true });
    await app.close();
  });

  describe("permissions and tenant isolation", () => {
    it("only the owner may export or erase; other roles 403, other salons 404", async () => {
      const c = await seedClient(a, ownerA);
      const roles = {
        manager: await bearerFor(app, await addSalonMember(prisma, a.salonId, "manager")),
        receptionist: await bearerFor(app, await addSalonMember(prisma, a.salonId, "receptionist")),
        staff: await bearerFor(app, await addSalonMember(prisma, a.salonId, "staff")),
      };
      const routes: ["get" | "post", string, object?][] = [
        ["get", `salons/${a.salonId}/customers/${c.profileId}/export`],
        ["post", `salons/${a.salonId}/customers/${c.profileId}/erase`, { confirm: true }],
        ["get", `salons/${a.salonId}/privacy/exports`],
        ["post", `salons/${a.salonId}/privacy/exports`, {}],
      ];
      for (const [m, path, body] of routes) {
        for (const [role, bearer] of Object.entries(roles)) {
          const res = await api(m, path, bearer, body);
          expect({ path, role, status: res.status }).toEqual({ path, role, status: 403 });
        }
        const foreign = await api(m, path, ownerB, body);
        expect({ path, status: foreign.status }).toEqual({ path, status: 404 });
      }
      // Salon B's owner on B's own path with A's client id: still 404 (scoped by salon).
      for (const sub of ["export"]) {
        const res = await api("get", `salons/${b.salonId}/customers/${c.profileId}/${sub}`, ownerB);
        expect(res.status).toBe(404);
      }
      const erase = await api(
        "post",
        `salons/${b.salonId}/customers/${c.profileId}/erase`,
        ownerB,
        {
          confirm: true,
        },
      );
      expect(erase.status).toBe(404);
      expect(await prisma.customerSalonProfile.count({ where: { id: c.profileId } })).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { action: { startsWith: "privacy." }, salonId: a.salonId },
        }),
      ).toBe(0);
    });

    it("erase requires an explicit confirmation", async () => {
      const c = await seedClient(a, ownerA);
      const res = await api(
        "post",
        `salons/${a.salonId}/customers/${c.profileId}/erase`,
        ownerA,
        {},
      );
      expect(res.status).toBe(400);
      expect(await prisma.customerSalonProfile.count({ where: { id: c.profileId } })).toBe(1);
    });
  });

  it("exports one client: bookings, notes, Zalo chat, notification log; readable text; audited", async () => {
    const c = await seedClient(a, ownerA);
    for (const locale of ["vi", "en"] as const) {
      const res = clientExportResultSchema.parse(
        (
          await api(
            "get",
            `salons/${a.salonId}/customers/${c.profileId}/export?locale=${locale}`,
            ownerA,
          ).expect(200)
        ).body,
      );
      const { json, text } = res;
      expect(json.client).toMatchObject({
        id: c.profileId,
        phone: c.phone.e164,
        email: c.email,
      });
      expect(json.bookings.map((x) => x.id).sort()).toEqual([c.upcoming, c.past].sort());
      expect(json.bookings.find((x) => x.id === c.past)?.history.some((h) => h.reasonText)).toBe(
        true,
      );
      expect(json.notes.map((n) => n.body)).toEqual(["Dị ứng tinh dầu"]);
      expect(json.zalo[0]?.messages.map((m) => m.text)).toEqual(["Cho em đặt lịch", "Dạ vâng"]);
      expect(text).toContain("Trần Thu Hà");
      expect(text).toContain("Dị ứng tinh dầu");
      expect(text).toContain(c.email);
      expect(text).toContain("Cho em đặt lịch");
      expect(text).toContain(locale === "vi" ? "Lịch hẹn" : "Bookings");
    }
    const audits = await prisma.auditLog.findMany({
      where: { action: "privacy.client_exported", targetId: c.profileId },
    });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain(c.phone.e164);
    expect(JSON.stringify(audits)).not.toContain("Trần");
  });

  it("erases a client everywhere in this salon only; bookings stay anonymised", async () => {
    const c = await seedClient(a, ownerA);
    // The same person is also a client of salon B: B's data must not change.
    const otherSalonBooking = await book(b, ownerB, c.phone.local, 2 + slot, "14:00");
    const otherSalonProfile = await profileFor(b, ownerB, c.phone.e164);

    const result = clientEraseResultSchema.parse(
      (
        await api("post", `salons/${a.salonId}/customers/${c.profileId}/erase`, ownerA, {
          confirm: true,
        }).expect(200)
      ).body,
    );
    expect(result).toEqual({
      anonymisedBookings: 2,
      cancelledBookings: 1,
      deletedNotes: 1,
      zaloConversations: 1,
      deletedZaloMessages: 2,
    });

    expect(await prisma.customerSalonProfile.count({ where: { id: c.profileId } })).toBe(0);
    expect(await prisma.customerNote.count({ where: { profileId: c.profileId } })).toBe(0);
    const rows = await prisma.booking.findMany({ where: { id: { in: [c.upcoming, c.past] } } });
    for (const r of rows) {
      expect(r).toMatchObject({
        customerName: "[deleted]",
        customerPhoneE164: null,
        customerPhoneHash: null,
        customerNote: null,
      });
      expect(r.customerAnonymisedAt).not.toBeNull();
    }
    expect(rows.find((r) => r.id === c.upcoming)?.status).toBe("cancelled_by_customer");
    expect(rows.find((r) => r.id === c.past)).toMatchObject({
      status: "completed",
      cancellationReason: null,
    });
    const lastUpcoming = await prisma.bookingStatusHistory.findFirstOrThrow({
      where: { bookingId: c.upcoming },
      orderBy: { occurredAt: "desc" },
    });
    expect(lastUpcoming).toMatchObject({ actorType: "system", reasonCode: "client_data_erased" });
    expect(
      await prisma.bookingStatusHistory.count({
        where: { bookingId: c.past, reasonText: { not: null } },
      }),
    ).toBe(0);

    // Zalo: content gone, conversation kept without name/phone; raw events of that user gone.
    expect(await prisma.zaloMessage.count({ where: { conversationId: c.conv.id } })).toBe(0);
    expect(
      await prisma.zaloConversation.findUniqueOrThrow({ where: { id: c.conv.id } }),
    ).toMatchObject({
      displayName: null,
      phoneE164: null,
      botState: {},
    });
    expect(await prisma.zaloWebhookEvent.count({ where: { oaId: c.conv.oaId } })).toBe(0);

    // The stored email went with the profile (q87): nothing in the salon still holds it.
    expect(
      await prisma.customerSalonProfile.count({
        where: { salonId: a.salonId, email: c.email },
      }),
    ).toBe(0);

    // The CRM shows the bookings as "deleted customer" and never re-creates the client.
    const view = salonBookingSchema.parse(
      (await api("get", `salons/${a.salonId}/bookings/${c.past}`, ownerA).expect(200)).body,
    );
    expect(view.customerAnonymised).toBe(true);
    const list = customerListSchema.parse(
      (await api("get", `salons/${a.salonId}/customers`, ownerA).expect(200)).body,
    );
    expect(list.items.some((x) => x.phone === c.phone.e164)).toBe(false);
    await api("get", `salons/${a.salonId}/customers/${c.profileId}`, ownerA).expect(404);

    // Salon B untouched.
    expect(
      await prisma.booking.findUniqueOrThrow({ where: { id: otherSalonBooking } }),
    ).toMatchObject({
      customerPhoneE164: c.phone.e164,
      customerName: "Trần Thu Hà",
      customerAnonymisedAt: null,
    });
    expect(await prisma.customerSalonProfile.count({ where: { id: otherSalonProfile } })).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "privacy.client_erased", targetId: c.profileId },
    });
    expect(audit).toMatchObject({ salonId: a.salonId, actorType: "user", actorId: a.ownerUserId });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/Trần|\+84/);

    // Erasing again: the client no longer exists.
    await api("post", `salons/${a.salonId}/customers/${c.profileId}/erase`, ownerA, {
      confirm: true,
    }).expect(404);
  });

  it("booking_status_history stays append-only apart from blanking reason_text", async () => {
    const c = await seedClient(a, ownerA);
    const h = await prisma.bookingStatusHistory.findFirstOrThrow({ where: { bookingId: c.past } });
    await expect(
      prisma.$executeRaw`UPDATE booking_status_history SET reason_code = 'x' WHERE id = ${h.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`UPDATE booking_status_history SET reason_text = 'other' WHERE id = ${h.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM booking_status_history WHERE id = ${h.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    const withText = await prisma.bookingStatusHistory.findFirstOrThrow({
      where: { bookingId: c.past, reasonText: { not: null } },
    });
    await expect(
      prisma.$executeRaw`UPDATE booking_status_history SET reason_text = NULL, to_status = 'no_show' WHERE id = ${withText.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await prisma.$executeRaw`UPDATE booking_status_history SET reason_text = NULL WHERE id = ${withText.id}::uuid`;
  });

  describe("salon-wide export", () => {
    it("queues one at a time, builds JSON + CSV, downloads from the panel only, expires", async () => {
      const c = await seedClient(a, ownerA);
      const created = salonExportSchema.parse(
        (await api("post", `salons/${a.salonId}/privacy/exports`, ownerA, {}).expect(202)).body,
      );
      expect(created.status).toBe("queued");
      const dup = await api("post", `salons/${a.salonId}/privacy/exports`, ownerA, {});
      expect(dup.status).toBe(409);
      expect(problemSchema.parse(dup.body).code).toBe(PRIVACY_ERRORS.exportInProgress);
      const early = await api(
        "get",
        `salons/${a.salonId}/privacy/exports/${created.id}/download`,
        ownerA,
      );
      expect(problemSchema.parse(early.body).code).toBe(PRIVACY_ERRORS.exportUnavailable);
      const job = await app.get(QueueService).queue(QUEUES.privacy).getJob(`export-${created.id}`);
      expect(job?.data).toEqual({ exportId: created.id });

      // The worker step.
      expect(await app.get(SalonExportService).run(created.id)).toEqual({ status: "ready" });
      expect(await app.get(SalonExportService).run(created.id)).toEqual({ status: "skipped" });
      const list = salonExportListSchema.parse(
        (await api("get", `salons/${a.salonId}/privacy/exports`, ownerA).expect(200)).body,
      );
      expect(list.items[0]).toMatchObject({ id: created.id, status: "ready" });
      expect(list.items[0]?.clients).toBeGreaterThanOrEqual(1);

      const json = salonExportDownloadSchema.parse(
        (
          await api(
            "get",
            `salons/${a.salonId}/privacy/exports/${created.id}/download`,
            ownerA,
          ).expect(200)
        ).body,
      );
      const parsed = JSON.parse(json.content) as {
        format: string;
        salon: { id: string };
        clients: { client: { id: string }; notes: { body: string }[] }[];
      };
      expect(parsed.format).toBe("gugu.salon-export.v1");
      expect(parsed.salon.id).toBe(a.salonId);
      expect(parsed.clients.find((x) => x.client.id === c.profileId)?.notes[0]?.body).toBe(
        "Dị ứng tinh dầu",
      );
      expect(json.content).not.toContain(b.salonId);
      const csv = salonExportDownloadSchema.parse(
        (
          await api(
            "get",
            `salons/${a.salonId}/privacy/exports/${created.id}/download?format=csv`,
            ownerA,
          ).expect(200)
        ).body,
      );
      expect(csv.mimeType).toBe("text/csv");
      expect(csv.content).toContain("Trần Thu Hà");

      // Another salon's owner cannot reach it, not even through their own salon path.
      await api("get", `salons/${b.salonId}/privacy/exports/${created.id}/download`, ownerB).expect(
        404,
      );
      expect(
        await prisma.auditLog.count({
          where: { action: "privacy.salon_export_downloaded", targetId: created.id },
        }),
      ).toBe(2);

      // Expiry: unavailable at once, content purged by the retention job.
      await prisma.privacyExport.update({
        where: { id: created.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const gone = await api(
        "get",
        `salons/${a.salonId}/privacy/exports/${created.id}/download`,
        ownerA,
      );
      expect(problemSchema.parse(gone.body).code).toBe(PRIVACY_ERRORS.exportUnavailable);
      await app.get(RetentionService).purge();
      expect(
        await prisma.privacyExport.findUniqueOrThrow({ where: { id: created.id } }),
      ).toMatchObject({ status: "expired", jsonGz: null, csvGz: null });
    });

    it("at most 3 exports per salon per day", async () => {
      const s = await createBookableSalon(prisma);
      const owner = await bearerFor(app, s.ownerUserId);
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await api("post", `salons/${s.salonId}/privacy/exports`, owner, {});
        statuses.push(res.status);
        if (res.status === 202) {
          await app.get(SalonExportService).run((res.body as { id: string }).id);
        }
      }
      expect(statuses).toEqual([202, 202, 202, 429]);
    });
  });

  it("q92: a suspended salon's owner can still erase a client and run the salon export; other writes stay blocked", async () => {
    const s = await createBookableSalon(prisma);
    const owner = await bearerFor(app, s.ownerUserId);
    const c = await seedClient(s, owner);
    await prisma.salon.update({
      where: { id: s.salonId },
      data: { status: "suspended", suspendedAt: new Date(), preSuspensionStatus: "active" },
    });

    // Every other write is still refused, e.g. adding a note to that client.
    const note = await api("post", `salons/${s.salonId}/customers/${c.profileId}/notes`, owner, {
      body: "Không được ghi khi bị khóa",
    });
    expect(note.status).toBe(403);
    expect(problemSchema.parse(note.body).code).toBe(SALON_SUSPENDED_ERROR);

    const erased = clientEraseResultSchema.parse(
      (
        await api("post", `salons/${s.salonId}/customers/${c.profileId}/erase`, owner, {
          confirm: true,
        }).expect(200)
      ).body,
    );
    expect(erased.deletedNotes).toBe(1);
    expect(await prisma.customerSalonProfile.count({ where: { id: c.profileId } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: "privacy.client_erased", salonId: s.salonId, targetId: c.profileId },
      }),
    ).toBe(1);

    const created = salonExportSchema.parse(
      (await api("post", `salons/${s.salonId}/privacy/exports`, owner, {}).expect(202)).body,
    );
    expect(await app.get(SalonExportService).run(created.id)).toEqual({ status: "ready" });
    await api("get", `salons/${s.salonId}/privacy/exports/${created.id}/download`, owner).expect(
      200,
    );
    for (const action of [
      "privacy.salon_export_requested",
      "privacy.salon_export_downloaded",
    ] as const) {
      expect(
        await prisma.auditLog.count({
          where: { action, salonId: s.salonId, targetId: created.id },
        }),
      ).toBe(1);
    }
    // Still owner-only while suspended.
    const manager = await bearerFor(app, await addSalonMember(prisma, s.salonId, "manager"));
    await api("post", `salons/${s.salonId}/privacy/exports`, manager, {}).expect(403);
  });

  it("q94: retention deletes audit rows older than AUDIT_RETENTION_MONTHS in batches; the trigger keeps the floor", async () => {
    const now = new Date();
    const monthsAgo = (n: number) => {
      const d = new Date(now);
      d.setUTCMonth(d.getUTCMonth() - n);
      return d;
    };
    const row = (createdAt: Date) => ({
      action: "salon.settings_updated",
      actorType: "system" as const,
      salonId: a.salonId,
      metadata: { test: "q94" },
      createdAt,
    });
    const expired = await prisma.auditLog.create({ data: row(monthsAgo(25)) });
    const kept = await prisma.auditLog.create({ data: row(monthsAgo(23)) });
    const young = await prisma.auditLog.create({ data: row(monthsAgo(6)) });

    // Outside the job the log stays append-only, flag or not, and younger than 12 months always.
    await expect(
      prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${expired.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('gugu.audit_retention', 'on', true)`;
        await tx.$executeRaw`DELETE FROM audit_logs WHERE id = ${young.id}::uuid`;
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('gugu.audit_retention', 'on', true)`;
        await tx.$executeRaw`UPDATE audit_logs SET action = 'x' WHERE id = ${expired.id}::uuid`;
      }),
    ).rejects.toThrow(/append-only/);

    const service = app.get(RetentionService);
    expect(service.auditCutoff(now).getTime()).toBe(monthsAgo(24).getTime());
    const counts = await service.purge(now);
    expect(counts.auditLogs).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditLog.count({ where: { id: expired.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { id: { in: [kept.id, young.id] } } })).toBe(2);

    // A config below the floor cannot reach younger rows (env refuses < 12; the service clamps).
    const config = app.get(AppConfig);
    const original = config.env.AUDIT_RETENTION_MONTHS;
    Object.assign(config.env, { AUDIT_RETENTION_MONTHS: 1 });
    try {
      expect(service.auditCutoff(now).getTime()).toBe(monthsAgo(12).getTime());
      await service.purge(now);
      expect(await prisma.auditLog.count({ where: { id: young.id } })).toBe(1);
    } finally {
      Object.assign(config.env, { AUDIT_RETENTION_MONTHS: original });
    }
    // The flag is transaction-local: after the job, an old row is protected again.
    const later = await prisma.auditLog.create({ data: row(monthsAgo(30)) });
    await expect(
      prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${later.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it("retention purges old notification log rows and stale secrets", async () => {
    const now = new Date();
    const old = new Date(now);
    old.setUTCMonth(old.getUTCMonth() - 13);
    const recent = new Date(now.getTime() - 3 * DAY);
    const mk = (createdAt: Date) => ({
      salonId: a.salonId,
      event: "salon.booking_received",
      audience: "team" as const,
      recipientUserId: a.ownerUserId,
      channel: "email",
      idempotencyKey: `ret-${randomUUID()}`,
      status: "sent" as const,
      createdAt,
    });
    const oldRow = await prisma.notificationDelivery.create({ data: mk(old) });
    const recentRow = await prisma.notificationDelivery.create({ data: mk(recent) });
    const inbox = await prisma.notification.create({
      data: {
        salonId: a.salonId,
        userId: a.ownerUserId,
        event: "salon.booking_created",
        deliveryId: oldRow.id,
        createdAt: old,
      },
    });
    const ended = await prisma.session.create({
      data: {
        userId: a.ownerUserId,
        kind: "web",
        tokenHash: `ret-${randomUUID()}`,
        tokenExpiresAt: new Date(now.getTime() - 40 * DAY),
        expiresAt: new Date(now.getTime() - 40 * DAY),
      },
    });
    const link = await prisma.magicLinkToken.create({
      data: {
        email: "ret@test.gugu.local",
        purpose: "sign_in",
        tokenHash: `ret-${randomUUID()}`,
        codeHash: `ret-${randomUUID()}`,
        expiresAt: new Date(now.getTime() - 2 * DAY),
      },
    });

    const counts = await app.get(RetentionService).purge(now);
    expect(counts.notificationDeliveries).toBeGreaterThanOrEqual(1);
    expect(await prisma.notificationDelivery.count({ where: { id: oldRow.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { id: inbox.id } })).toBe(0);
    expect(await prisma.notificationDelivery.count({ where: { id: recentRow.id } })).toBe(1);
    expect(await prisma.session.count({ where: { id: ended.id } })).toBe(0);
    expect(await prisma.magicLinkToken.count({ where: { id: link.id } })).toBe(0);
    // The owner's live sessions survive.
    expect(
      await prisma.session.count({
        where: { userId: a.ownerUserId, revokedAt: null, expiresAt: { gt: now } },
      }),
    ).toBeGreaterThan(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "privacy.retention_purged" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.actorType).toBe("system");
  });
});
