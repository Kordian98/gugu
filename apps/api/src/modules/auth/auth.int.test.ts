// Integration against the local stack (`pnpm stack:up`): real Postgres, Valkey and Mailpit.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authSessionSchema,
  meResponseSchema,
  nativeTokensSchema,
  problemSchema,
} from "@gugu/contracts";
import { testEmail } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { countMailsTo, extractMagicLink, waitForMail } from "../../../test/mailpit";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

describe("auth: magic link, sessions, CSRF (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const requestLink = (email: string, client: "web" | "native" = "web", locale = "vi") =>
    request(http(app))
      .post("/api/v1/auth/magic-link")
      .send({ email, locale, client, redirectPath: "/vi/me" })
      .expect(202, { status: "sent" });

  it("web: emails a localized link; verifying sets an httpOnly cookie and /me works", async () => {
    const email = testEmail("web");
    await requestLink(email);
    const mail = await waitForMail(email);
    expect(mail.subject).toBe("Link đăng nhập GuGu của bạn");
    const { token, url } = extractMagicLink(mail);
    expect(url).toContain("/vi/auth/verify?token=");

    const res = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ token })
      .expect(200);
    const session = authSessionSchema.parse(res.body);
    expect(session.session.kind).toBe("web");
    expect(session.redirectPath).toBe("/vi/me");
    expect(session.user.email).toBe(email);
    expect(session.user.emailVerified).toBe(true);
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/^gugu_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toContain(cookie.split(";")[0]?.split("=")[1] ?? "x");

    const me = await request(http(app))
      .get("/api/v1/me")
      .set("cookie", cookie.split(";")[0] ?? "")
      .expect(200);
    const body = meResponseSchema.parse(me.body);
    expect(body.user.id).toBe(session.user.id);
    expect(body.csrfToken).toBe(session.session.kind === "web" ? session.session.csrfToken : "");

    // Second use of the same link fails.
    await request(http(app)).post("/api/v1/auth/magic-link/verify").send({ token }).expect(400);
  });

  it("web: writes need the CSRF header; sign-out revokes the session", async () => {
    const email = testEmail("csrf");
    await requestLink(email);
    const { token } = extractMagicLink(await waitForMail(email));
    const res = await request(http(app)).post("/api/v1/auth/magic-link/verify").send({ token });
    const session = authSessionSchema.parse(res.body);
    const cookie = (res.headers["set-cookie"]?.[0] ?? "").split(";")[0] ?? "";
    const csrf = session.session.kind === "web" ? session.session.csrfToken : "";

    const noCsrf = await request(http(app)).post("/api/v1/auth/sign-out").set("cookie", cookie);
    expect(noCsrf.status).toBe(403);
    expect(problemSchema.parse(noCsrf.body).code).toBe("auth.csrf_failed");

    await request(http(app))
      .post("/api/v1/auth/sign-out")
      .set("cookie", cookie)
      .set("x-csrf-token", csrf)
      .expect(204);
    await request(http(app)).get("/api/v1/me").set("cookie", cookie).expect(401);
  });

  it("native: code flow, refresh rotation and reuse detection", async () => {
    const email = testEmail("native");
    await requestLink(email, "native", "en");
    const mail = await waitForMail(email);
    expect(mail.subject).toBe("Your GuGu sign-in link");
    const { code } = extractMagicLink(mail);

    const res = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ email, code, client: "native" })
      .expect(200);
    const session = authSessionSchema.parse(res.body);
    if (session.session.kind !== "native") throw new Error("expected native tokens");
    expect(res.headers["set-cookie"]).toBeUndefined();
    const first = session.session.tokens;

    await request(http(app))
      .get("/api/v1/me")
      .set("authorization", `Bearer ${first.accessToken}`)
      .expect(200);

    const rotated = nativeTokensSchema.parse(
      (
        await request(http(app))
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: first.refreshToken })
          .expect(200)
      ).body,
    );
    // Old access token no longer works; new one does.
    await request(http(app))
      .get("/api/v1/me")
      .set("authorization", `Bearer ${first.accessToken}`)
      .expect(401);
    await request(http(app))
      .get("/api/v1/me")
      .set("authorization", `Bearer ${rotated.accessToken}`)
      .expect(200);

    // Reusing the spent refresh token revokes the whole session (and audits it).
    await request(http(app))
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await request(http(app))
      .get("/api/v1/me")
      .set("authorization", `Bearer ${rotated.accessToken}`)
      .expect(401);
    await request(http(app))
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "auth.session_reuse_detected", actorId: session.user.id },
    });
    expect(audit).not.toBeNull();
  });

  it("locks a link's code after 5 wrong attempts, but its emailed token still works", async () => {
    const email = testEmail("lock");
    await requestLink(email);
    const { code, token } = extractMagicLink(await waitForMail(email));
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await request(http(app))
        .post("/api/v1/auth/magic-link/verify")
        .send({ email, code: wrong })
        .expect(400);
    }
    const locked = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ email, code: wrong });
    expect(locked.status).toBe(429);
    // Even the right code is refused on a locked link…
    await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ email, code })
      .expect(429);
    // …but a third party guessing codes can't take away the mailbox owner's link.
    await request(http(app)).post("/api/v1/auth/magic-link/verify").send({ token }).expect(200);
  });

  it("parallel wrong guesses never get more than 5 comparisons on one link", async () => {
    const email = testEmail("race");
    await clearRateLimits(app);
    await requestLink(email);
    const { code } = extractMagicLink(await waitForMail(email));
    const wrong = code === "000000" ? "111111" : "000000";
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(http(app)).post("/api/v1/auth/magic-link/verify").send({ email, code: wrong }),
      ),
    );
    const compared = results.filter((r) => r.status === 400).length;
    expect(compared).toBeLessThanOrEqual(5);
    expect(results.every((r) => r.status === 400 || r.status === 429)).toBe(true);
    const row = await prisma.magicLinkToken.findFirstOrThrow({
      where: { email },
      orderBy: { createdAt: "desc" },
    });
    expect(row.attempts).toBe(5);
  });

  it("no third-party lockout: guesses without a live link don't count; older failures don't block a newer link", async () => {
    const email = testEmail("lockout");
    await clearRateLimits(app);
    // Attacker guesses while the victim has no live link: nothing is recorded.
    for (let i = 0; i < 15; i++) {
      await request(http(app))
        .post("/api/v1/auth/magic-link/verify")
        .send({ email, code: String(100000 + i) })
        .expect(400);
    }
    // Attacker burns the victim's first link (5 wrong codes on it).
    await requestLink(email);
    const first = extractMagicLink(await waitForMail(email));
    const wrong = first.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await request(http(app)).post("/api/v1/auth/magic-link/verify").send({ email, code: wrong });
    }
    await new Promise((r) => setTimeout(r, 50));
    // The victim is on another network: reset only the per-IP verify counter the attacker used.
    const redis = app.get(RedisService).client;
    const ipKeys = await redis.keys("rl:auth.verify.ip:*");
    if (ipKeys.length) await redis.del(...ipKeys);
    // The victim requests a new link: its correct code works despite all earlier failures.
    await requestLink(email);
    const second = extractMagicLink(await waitForMail(email));
    expect(second.code === first.code && second.token === first.token).toBe(false);
    const res = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ email, code: second.code })
      .expect(200);
    expect(authSessionSchema.parse(res.body).user.email).toBe(email);
  });

  it("stores only hashes: no token or code in the database", async () => {
    const email = testEmail("hash");
    await requestLink(email);
    const { token, code } = extractMagicLink(await waitForMail(email));
    const row = await prisma.magicLinkToken.findFirstOrThrow({
      where: { email },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.codeHash).not.toContain(code);
  });

  it("rate-limits magic links per email (4th within 15 min → 429), same body for unknown emails", async () => {
    const email = testEmail("rate");
    for (let i = 0; i < 3; i++) await requestLink(email);
    await request(http(app))
      .post("/api/v1/auth/magic-link")
      .send({ email, locale: "vi" })
      .expect(429);
    expect(await countMailsTo(email)).toBe(3);
  });

  it("rejects unauthenticated /me and invalid bearer tokens", async () => {
    const anon = await request(http(app)).get("/api/v1/me").expect(401);
    expect(problemSchema.parse(anon.body).code).toBe("auth.unauthenticated");
    await request(http(app)).get("/api/v1/me").set("authorization", "Bearer nope").expect(401);
  });

  it("reports providers: Apple/Google disabled without client IDs, Zalo hidden", async () => {
    await request(http(app))
      .get("/api/v1/auth/providers")
      .expect(200, { emailMagicLink: true, google: false, apple: false, zalo: false });
    await request(http(app))
      .post("/api/v1/auth/social")
      .send({ provider: "google", idToken: "x".repeat(40), locale: "vi" })
      .expect(404);
  });

  it("audit log is append-only", async () => {
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "auth.sign_in" } });
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });
});
