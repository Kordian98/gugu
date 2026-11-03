// Platform-admin TOTP step-up (topic 05 step 9, ADR-0011) against the local stack, on
// TEST_DATABASE_URL only. Enrolment (fresh sign-in, QR once, confirm with the first code),
// recovery codes (hashed, single-use), step-up bound to the session, replay protection,
// failure rate limit, re-enrolment, and that nothing secret is stored or returned in plaintext.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_ERRORS,
  ADMIN_MFA_ERRORS,
  adminMfaEnrolmentSchema,
  adminMfaRecoveryCodesSchema,
  adminMfaStatusSchema,
  adminStepUpResultSchema,
  problemSchema,
} from "@gugu/contracts";
import type { PlatformRole } from "@gugu/domain";
import {
  addSalonMember,
  bearerFor,
  createSalonFixture,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { SessionService, totp } from "./auth.facade";

const STEP_MS = 30_000;

describe("admin TOTP step-up (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const admin = async (role: PlatformRole = "super_admin") => {
    const user = await prisma.user.create({
      data: {
        email: testEmail(`mfa-${role}`),
        emailVerifiedAt: new Date(),
        platformRole: role,
        profile: { create: {} },
      },
    });
    const issued = await app.get(SessionService).create(user.id, "native", {
      ipPrefix: null,
      userAgent: "vitest",
    });
    if (issued.kind !== "native") throw new Error("expected native session");
    return {
      id: user.id,
      sessionId: issued.sessionId,
      bearer: `Bearer ${issued.tokens.accessToken}`,
    };
  };
  const call = (method: "get" | "post", path: string, bearer: string, body?: object) => {
    const r = request(http(app))[method](`/api/v1/admin/${path}`).set("authorization", bearer);
    return body ? r.send(body) : r;
  };
  /** Enrols through the API and returns the secret and recovery codes. */
  const enrol = async (bearer: string) => {
    const started = adminMfaEnrolmentSchema.parse(
      (await call("post", "mfa/totp/enrol", bearer).expect(200)).body,
    );
    const confirmCode = totp(started.secret, Date.now());
    const confirmed = adminMfaRecoveryCodesSchema.parse(
      (await call("post", "mfa/totp/confirm", bearer, { code: confirmCode }).expect(200)).body,
    );
    return {
      secret: started.secret,
      uri: started.otpauthUri,
      codes: confirmed.recoveryCodes,
      confirmCode,
    };
  };
  const suspendSalon = async (bearer: string) => {
    const s = await createSalonFixture(prisma, "MFA Suspend");
    return call("post", `salons/${s.salonId}/suspend`, bearer, { reason: "MFA test suspension" });
  };

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await clearRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("anonymous → 401, salon members → 403 on every /admin/mfa route", async () => {
    const s = await createSalonFixture(prisma, "MFA Matrix");
    const owner = await bearerFor(app, s.ownerUserId);
    const staff = await bearerFor(app, await addSalonMember(prisma, s.salonId, "staff"));
    const routes: ["get" | "post", string][] = [
      ["get", "mfa"],
      ["post", "mfa/totp/enrol"],
      ["post", "mfa/totp/confirm"],
      ["post", "mfa/step-up"],
      ["post", "mfa/recovery-codes"],
    ];
    for (const [m, path] of routes) {
      const anon = await request(http(app))[m](`/api/v1/admin/${path}`).send({ code: "123456" });
      expect({ path, status: anon.status }).toEqual({ path, status: 401 });
      for (const bearer of [owner, staff]) {
        const res = await call(m, path, bearer, { code: "123456" });
        expect({ path, status: res.status }).toEqual({ path, status: 403 });
      }
    }
  });

  it("enrols: secret shown once, sealed at rest; recovery codes hashed; session elevated", async () => {
    const a = await admin("support_admin");
    const status0 = adminMfaStatusSchema.parse(
      (await call("get", "mfa", a.bearer).expect(200)).body,
    );
    expect(status0).toMatchObject({ enrolled: false, pending: false, stepUpUntil: null });

    const { secret, uri, codes } = await enrol(a.bearer);
    expect(uri).toContain(`secret=${secret}`);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);

    const status = adminMfaStatusSchema.parse(
      (await call("get", "mfa", a.bearer).expect(200)).body,
    );
    expect(status).toMatchObject({ enrolled: true, pending: false, recoveryCodesRemaining: 10 });
    expect(new Date(status.stepUpUntil ?? 0).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(JSON.stringify(status)).not.toContain(secret);

    // Nothing in plaintext: not the TOTP secret, not a recovery code (AC2-style dump check).
    const factor = await prisma.adminMfaFactor.findUniqueOrThrow({ where: { userId: a.id } });
    const stored = JSON.stringify({
      factor: { ...factor, lastUsedStep: String(factor.lastUsedStep) },
      codes: await prisma.adminRecoveryCode.findMany({ where: { userId: a.id } }),
    });
    expect(stored).not.toContain(secret);
    for (const c of codes) {
      expect(stored).not.toContain(c);
      expect(stored).not.toContain(c.replace("-", ""));
    }
    const audits = await prisma.auditLog.findMany({
      where: { actorId: a.id, action: { startsWith: "admin.mfa" } },
    });
    expect(audits.map((x) => x.action)).toEqual(["admin.mfa_enrolled"]);
    expect(JSON.stringify(audits)).not.toContain(secret);
  });

  it("first enrolment needs a sign-in within 15 minutes", async () => {
    const a = await admin();
    await prisma.session.update({
      where: { id: a.sessionId },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });
    const res = await call("post", "mfa/totp/enrol", a.bearer);
    expect(res.status).toBe(403);
    expect(problemSchema.parse(res.body).code).toBe(ADMIN_MFA_ERRORS.freshSignInRequired);
  });

  it("confirm without enrolment or with a wrong code fails; nothing enrolled", async () => {
    const a = await admin();
    const none = await call("post", "mfa/totp/confirm", a.bearer, { code: "123456" });
    expect(problemSchema.parse(none.body).code).toBe(ADMIN_MFA_ERRORS.enrollmentNotStarted);
    const started = adminMfaEnrolmentSchema.parse(
      (await call("post", "mfa/totp/enrol", a.bearer).expect(200)).body,
    );
    const wrong = String((Number(totp(started.secret, Date.now())) + 1) % 1_000_000).padStart(
      6,
      "0",
    );
    const res = await call("post", "mfa/totp/confirm", a.bearer, { code: wrong });
    expect(res.status).toBe(400);
    expect(problemSchema.parse(res.body).code).toBe(ADMIN_MFA_ERRORS.codeInvalid);
    const status = adminMfaStatusSchema.parse(
      (await call("get", "mfa", a.bearer).expect(200)).body,
    );
    expect(status).toMatchObject({ enrolled: false, pending: true });
    // Not enrolled: every admin write is refused before anything changes.
    const w = await suspendSalon(a.bearer);
    expect(problemSchema.parse(w.body).code).toBe(ADMIN_MFA_ERRORS.enrollmentRequired);
  });

  it("step-up with TOTP: elevates this session only; a code cannot be replayed", async () => {
    const a = await admin();
    const { secret, confirmCode } = await enrol(a.bearer);
    // The same code that confirmed the enrolment is a replay.
    const replay = await call("post", "mfa/step-up", a.bearer, { code: confirmCode });
    expect(problemSchema.parse(replay.body).code).toBe(ADMIN_MFA_ERRORS.codeInvalid);

    const other = await bearerFor(app, a.id);
    const before = await suspendSalon(other);
    expect(problemSchema.parse(before.body).code).toBe(ADMIN_ERRORS.stepUpRequired);

    const next = totp(secret, Date.now() + STEP_MS);
    const ok = adminStepUpResultSchema.parse(
      (await call("post", "mfa/step-up", other, { code: next }).expect(200)).body,
    );
    expect(ok.recoveryCodesRemaining).toBe(10);
    expect((await suspendSalon(other)).status).toBe(200);
    // Still the same code: replay on yet another session fails.
    const third = await bearerFor(app, a.id);
    const again = await call("post", "mfa/step-up", third, { code: next });
    expect(problemSchema.parse(again.body).code).toBe(ADMIN_MFA_ERRORS.codeInvalid);
  });

  it("step-up with a recovery code: single use, any format", async () => {
    const a = await admin();
    const { codes } = await enrol(a.bearer);
    const s1 = await bearerFor(app, a.id);
    const code = codes[0] ?? "";
    const res = adminStepUpResultSchema.parse(
      (
        await call("post", "mfa/step-up", s1, {
          recoveryCode: ` ${code.toLowerCase().replace("-", " ")} `,
        }).expect(200)
      ).body,
    );
    expect(res.recoveryCodesRemaining).toBe(9);
    const s2 = await bearerFor(app, a.id);
    const reused = await call("post", "mfa/step-up", s2, { recoveryCode: code });
    expect(problemSchema.parse(reused.body).code).toBe(ADMIN_MFA_ERRORS.codeInvalid);
    const methods = await prisma.auditLog.findMany({
      where: { actorId: a.id, action: "admin.mfa_step_up" },
      select: { metadata: true },
    });
    expect(methods.map((m) => (m.metadata as { method: string }).method)).toEqual([
      "recovery_code",
    ]);
  });

  it("5 wrong codes in 15 minutes lock MFA checks (429), audited", async () => {
    const a = await admin();
    const { secret } = await enrol(a.bearer);
    const bad = String((Number(totp(secret, Date.now())) + 7) % 1_000_000).padStart(6, "0");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await call("post", "mfa/step-up", a.bearer, { code: bad })).status);
    }
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    // Even the right code is refused while locked.
    const right = await call("post", "mfa/step-up", a.bearer, {
      code: totp(secret, Date.now() + STEP_MS),
    });
    expect(right.status).toBe(429);
    expect(
      await prisma.auditLog.count({ where: { actorId: a.id, action: "admin.mfa_step_up_failed" } }),
    ).toBeGreaterThanOrEqual(5);
  });

  it("12 parallel wrong codes: at most 5 are evaluated, the rest get 429 (reserve before compare)", async () => {
    const a = await admin();
    const { secret } = await enrol(a.bearer);
    const bad = String((Number(totp(secret, Date.now())) + 11) % 1_000_000).padStart(6, "0");
    const results = await Promise.all(
      Array.from({ length: 12 }, () => call("post", "mfa/step-up", a.bearer, { code: bad })),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((x) => x === 400).length).toBeLessThanOrEqual(5);
    expect(statuses.filter((x) => x === 429).length).toBeGreaterThanOrEqual(7);
    expect(statuses.every((x) => x === 400 || x === 429)).toBe(true);
    // Only evaluated attempts are audited as failures.
    expect(
      await prisma.auditLog.count({ where: { actorId: a.id, action: "admin.mfa_step_up_failed" } }),
    ).toBeLessThanOrEqual(5);
    // Recovery codes go through the same reservation.
    const more = await Promise.all(
      Array.from({ length: 4 }, () =>
        call("post", "mfa/step-up", a.bearer, { recoveryCode: "AAAAA-BBBBB" }),
      ),
    );
    expect(more.map((r) => r.status)).toEqual([429, 429, 429, 429]);
  });

  it("a code used in parallel requests elevates exactly one session (no replay)", async () => {
    const a = await admin();
    const { secret, codes } = await enrol(a.bearer);
    const sessions = await Promise.all(Array.from({ length: 4 }, () => bearerFor(app, a.id)));
    const code = totp(secret, Date.now() + STEP_MS);
    const totpResults = await Promise.all(
      sessions.map((b) => call("post", "mfa/step-up", b, { code })),
    );
    expect(totpResults.filter((r) => r.status === 200)).toHaveLength(1);
    await clearRateLimits(app);
    const recovery = codes[2] ?? "";
    const recResults = await Promise.all(
      sessions.map((b) => call("post", "mfa/step-up", b, { recoveryCode: recovery })),
    );
    expect(recResults.filter((r) => r.status === 200)).toHaveLength(1);
    expect(
      await prisma.adminRecoveryCode.count({ where: { userId: a.id, usedAt: { not: null } } }),
    ).toBe(1);
  });

  it("successful attempts are refunded: they never lock the admin out", async () => {
    const a = await admin();
    const { codes } = await enrol(a.bearer);
    for (let i = 0; i < 6; i++) {
      const b = await bearerFor(app, a.id);
      await call("post", "mfa/step-up", b, { recoveryCode: codes[i] }).expect(200);
    }
  });

  it("re-enrolment needs a step-up; the old factor works until the new one is confirmed", async () => {
    const a = await admin();
    const first = await enrol(a.bearer);
    const s2 = await bearerFor(app, a.id);
    const denied = await call("post", "mfa/totp/enrol", s2);
    expect(problemSchema.parse(denied.body).code).toBe(ADMIN_ERRORS.stepUpRequired);
    // a.bearer is elevated by the first confirmation.
    const started = adminMfaEnrolmentSchema.parse(
      (await call("post", "mfa/totp/enrol", a.bearer).expect(200)).body,
    );
    // Old factor still steps up another session meanwhile.
    await call("post", "mfa/step-up", s2, {
      code: totp(first.secret, Date.now() + STEP_MS),
    }).expect(200);
    const confirmed = adminMfaRecoveryCodesSchema.parse(
      (
        await call("post", "mfa/totp/confirm", a.bearer, {
          code: totp(started.secret, Date.now()),
        }).expect(200)
      ).body,
    );
    // Old recovery codes are gone; the old secret no longer works.
    const s3 = await bearerFor(app, a.id);
    const oldCode = await call("post", "mfa/step-up", s3, { recoveryCode: first.codes[1] });
    expect(oldCode.status).toBe(400);
    await call("post", "mfa/step-up", s3, { recoveryCode: confirmed.recoveryCodes[0] }).expect(200);
    expect(
      await prisma.auditLog.count({ where: { actorId: a.id, action: "admin.mfa_reset" } }),
    ).toBe(1);
  });

  it("regenerating recovery codes needs a TOTP code and invalidates the old ones", async () => {
    const a = await admin();
    const { secret, codes } = await enrol(a.bearer);
    const res = adminMfaRecoveryCodesSchema.parse(
      (
        await call("post", "mfa/recovery-codes", a.bearer, {
          code: totp(secret, Date.now() + STEP_MS),
        }).expect(200)
      ).body,
    );
    expect(res.recoveryCodes.some((c) => codes.includes(c))).toBe(false);
    const s2 = await bearerFor(app, a.id);
    expect((await call("post", "mfa/step-up", s2, { recoveryCode: codes[0] })).status).toBe(400);
  });

  it("a revoked session cannot be elevated", async () => {
    const a = await admin();
    const { secret } = await enrol(a.bearer);
    const issued = await app.get(SessionService).create(a.id, "native", {
      ipPrefix: null,
      userAgent: "t",
    });
    if (issued.kind !== "native") throw new Error("expected native session");
    await app.get(SessionService).revoke(issued.sessionId, "test");
    const res = await call("post", "mfa/step-up", `Bearer ${issued.tokens.accessToken}`, {
      code: totp(secret, Date.now() + STEP_MS),
    });
    expect(res.status).toBe(401);
  });
});
