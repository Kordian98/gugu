// Integration: the optional client email on the CRM profile (owner q87, X26). Stored only — GuGu
// never sends to it — with the same visibility rule as the phone (`customers.phone.read`), editable
// only by members who see it unmasked, validated, and scoped to the salon.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customerDetailSchema } from "@gugu/contracts";
import { addSalonMember, bearerFor } from "../../../test/factories/identity";
import { createBookableSalon, type BookableSalonFixture } from "../../../test/factories/booking";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

describe("client profile email (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(http(app));
  const path = (id = "") => `/api/v1/salons/${s.salonId}/customers${id ? `/${id}` : ""}`;
  const detail = async (id: string, bearer: string) =>
    customerDetailSchema.parse(
      (await api().get(path(id)).set("authorization", bearer).expect(200)).body,
    );

  it("stores, masks, edits and clears the email under the phone's visibility rule", async () => {
    await api()
      .post(path())
      .set("authorization", owner)
      .send({ displayName: "Trần Thu Hà", phone: "0905 111 222", email: "not an email" })
      .expect(400);
    const ok = await api()
      .post(path())
      .set("authorization", owner)
      .send({ displayName: "Trần Thu Hà", phone: "0905 111 222", email: "Ha.Tran@Example.vn" })
      .expect(201);
    const id = (ok.body as { id: string }).id;
    expect((await detail(id, owner)).email).toBe("ha.tran@example.vn");

    // A receptionist without customers.phone.read sees it masked and cannot change it.
    const recUser = await addSalonMember(prisma, s.salonId, "receptionist");
    await prisma.salonMember.updateMany({
      where: { salonId: s.salonId, userId: recUser },
      data: { permissionsOverride: { revoke: ["customers.phone.read"] } },
    });
    const rec = await bearerFor(app, recUser);
    const masked = await detail(id, rec);
    expect(masked.email).toBe("h•••@example.vn");
    expect(masked.phone).toContain("•");
    await api()
      .patch(path(id))
      .set("authorization", rec)
      .send({ email: "other@example.vn" })
      .expect(403);
    // Other fields stay editable for them.
    await api()
      .patch(path(id))
      .set("authorization", rec)
      .send({ tags: ["VIP"] })
      .expect(204);

    // The owner edits, then clears it.
    await api()
      .patch(path(id))
      .set("authorization", owner)
      .send({ email: "not-an-email" })
      .expect(400);
    await api()
      .patch(path(id))
      .set("authorization", owner)
      .send({ email: "ha@example.vn" })
      .expect(204);
    expect((await detail(id, owner)).email).toBe("ha@example.vn");
    await api().patch(path(id)).set("authorization", owner).send({ email: null }).expect(204);
    expect((await detail(id, owner)).email).toBeNull();

    // Audit records field names only, never the address.
    const audits = await prisma.auditLog.findMany({
      where: { salonId: s.salonId, targetId: id, action: "customers.updated" },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain("ha@example.vn");
  });

  it("keeps the email inside the salon (another salon gets 404)", async () => {
    const ok = await api()
      .post(path())
      .set("authorization", owner)
      .send({ displayName: "Lê Minh", phone: "0905 333 444", email: "minh@example.vn" })
      .expect(201);
    const other = await createBookableSalon(prisma);
    const otherOwner = await bearerFor(app, other.ownerUserId);
    await api()
      .get(`/api/v1/salons/${other.salonId}/customers/${(ok.body as { id: string }).id}`)
      .set("authorization", otherOwner)
      .expect(404);
    await api()
      .patch(`/api/v1/salons/${other.salonId}/customers/${(ok.body as { id: string }).id}`)
      .set("authorization", otherOwner)
      .send({ email: "x@example.vn" })
      .expect(404);
  });
});
