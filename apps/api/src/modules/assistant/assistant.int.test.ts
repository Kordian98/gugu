// Integration against the local stack: the AI assistant turn over HTTP (SSE) with a scripted,
// recording LLM. PII canary suite: staff/customer/salon names, phone numbers and notes planted in
// the salon must never appear in any request sent to the model gateway.
import type Anthropic from "@anthropic-ai/sdk";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ASSISTANT_ERRORS, type AssistantEvent, SUBSCRIPTION_ERRORS } from "@gugu/contracts";
import { createBookableSalon } from "../../../test/factories/booking";
import { addSalonMember, bearerFor, createSalonFixture } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { EntitlementService, SubscriptionsFacade } from "../subscriptions/subscriptions.facade";
import { AssistantLlm, type TurnBody, type TurnMessage } from "./llm/assistant-llm";

const CANARY = {
  staff: "Canaryhoa Nguyễn",
  customer: "Canarybich Trần",
  phone: "0912 345 678",
  note: "canary-note-dị-ứng-gel",
  salon: "Canary Lotus Spa",
};

type Script = (body: TurnBody, call: number) => Partial<TurnMessage> & { text?: string };

/** Recording fake: replies from a script, streams text in tiny pieces to exercise re-hydration. */
class FakeLlm extends AssistantLlm {
  configured = true;
  requests: TurnBody[] = [];
  script: Script = () => ({ text: "OK" });
  async turn(body: TurnBody, onText: (d: string) => void): Promise<TurnMessage> {
    this.requests.push(structuredClone(body));
    const r = this.script(body, this.requests.length);
    const content = r.content ?? [];
    if (r.text !== undefined) {
      for (let i = 0; i < r.text.length; i += 3) onText(r.text.slice(i, i + 3));
      content.unshift({
        type: "text",
        text: r.text,
        citations: null,
      });
    }
    return Promise.resolve({
      id: `msg_${String(this.requests.length)}`,
      type: "message",
      role: "assistant",
      model: body.model,
      stop_reason:
        r.stop_reason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn"),
      usage: { input_tokens: 1200, output_tokens: 150 },
      ...r,
      content,
    } as unknown as TurnMessage);
  }
}

const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as Anthropic.Beta.Messages.BetaToolUseBlock;

/** Last tool_result of the last request, parsed. */
function lastToolResult(llm: FakeLlm): Record<string, unknown> {
  const msgs = llm.requests.at(-1)?.messages ?? [];
  const blocks = msgs.at(-1)?.content as { type: string; content?: string }[];
  const r = [...blocks].reverse().find((b) => b.type === "tool_result");
  return JSON.parse(r?.content ?? "{}") as Record<string, unknown>;
}

function parseSse(text: string): AssistantEvent[] {
  return text
    .split("\n\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as AssistantEvent);
}

describe("AI assistant (integration)", () => {
  const llm = new FakeLlm();
  let app: INestApplication;
  let prisma: PrismaService;
  let salonId: string;
  let owner: string;
  let staffMember: string;
  let otherOwner: string;
  let noPlanOwner: string;
  let noPlanSalonId: string;
  let staffA: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AssistantLlm)
      .useValue(llm)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    const salon = await createBookableSalon(prisma);
    salonId = salon.salonId;
    await prisma.salon.update({ where: { id: salonId }, data: { name: CANARY.salon } });
    await app.get(SubscriptionsFacade).startTrial({ salonId });
    staffA = salon.staffIds[0];
    await prisma.staffProfile.update({
      where: { id: staffA },
      data: { displayName: CANARY.staff },
    });
    const day = (h: number) => new Date(Date.now() + h * 3600_000);
    for (const [i, h] of [1, 2, -30].entries()) {
      const booking = await prisma.booking.create({
        data: {
          salonId,
          referenceCode: `CANA${String(i)}`,
          status: "confirmed",
          source: "phone",
          createdByActorType: "salon_member",
          staffId: staffA,
          startsAt: day(h),
          endsAt: day(h + 0.5),
          totalPriceMinor: 200_000n,
          customerName: CANARY.customer,
          customerNote: CANARY.note,
        },
      });
      await prisma.bookingService.create({
        data: {
          salonId,
          bookingId: booking.id,
          serviceId: salon.serviceId,
          staffId: staffA,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          name: { vi: "Sơn gel", en: "Gel polish" },
          durationMinutes: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 10,
          priceMinor: 200_000n,
        },
      });
    }
    owner = await bearerFor(app, salon.ownerUserId);
    staffMember = await bearerFor(app, await addSalonMember(prisma, salonId, "staff"));
    const other = await createSalonFixture(prisma, "Assistant other");
    await app.get(SubscriptionsFacade).startTrial({ salonId: other.salonId });
    otherOwner = await bearerFor(app, other.ownerUserId);
    const noPlan = await createSalonFixture(prisma, "Assistant no plan");
    noPlanSalonId = noPlan.salonId;
    noPlanOwner = await bearerFor(app, noPlan.ownerUserId);
  }, 60_000);
  beforeEach(async () => {
    await clearRateLimits(app);
    llm.requests = [];
  });
  afterAll(async () => {
    await app.close();
  });

  const ask = (text: string, bearer = owner, conversationId?: string, salon = salonId) =>
    request(http(app))
      .post(`/api/v1/salons/${salon}/assistant/turns`)
      .set("authorization", bearer)
      .send({ text, locale: "vi", ...(conversationId ? { conversationId } : {}) });

  it("reports status for a Pro-trial owner", async () => {
    const res = await request(http(app))
      .get(`/api/v1/salons/${salonId}/assistant`)
      .set("authorization", owner)
      .expect(200);
    expect(res.body).toEqual({ configured: true, entitled: true, permitted: true });
  });

  it("answers through tools with tokens only and re-hydrates names for the owner", async () => {
    llm.script = (_body, call) => {
      if (call === 1)
        return { content: [toolUse("t1", "resolve_period", { expression: "today" })] };
      if (call === 2) {
        const { from, to } = lastToolResult(llm) as { from: string; to: string };
        return {
          content: [toolUse("t2", "bookings_count", { from, to, statuses: [], groupBy: "staff" })],
        };
      }
      return { text: "Hôm nay staff_1 có 2 lịch hẹn." };
    };
    const res = await ask(
      `Hôm nay chị ${CANARY.staff} có mấy lịch? Khách ${CANARY.customer} gọi ${CANARY.phone}`,
    ).expect(200);
    const events = parseSse(res.text);
    const masked = events.find((e) => e.type === "masked");
    expect(masked).toMatchObject({ changed: true });
    expect(JSON.stringify(masked)).not.toContain(CANARY.customer);
    expect(JSON.stringify(masked)).not.toContain(CANARY.phone);
    const answer = events
      .filter((e) => e.type === "delta")
      .map((e) => (e as { text: string }).text)
      .join("");
    expect(answer).toBe(`Hôm nay ${CANARY.staff} có 2 lịch hẹn.`);
    expect(
      events.filter((e) => e.type === "source").map((e) => (e as { tool: string }).tool),
    ).toEqual(["resolve_period", "bookings_count"]);
    expect(events.at(-1)).toMatchObject({ type: "done", model: "claude-haiku-5-5" });

    // The model saw the grouped count with a token, never the name.
    const counted = lastToolResult(llm) as {
      total: number;
      groups: { key: string; count: number }[];
    };
    expect(counted.groups).toEqual([{ key: "staff_1", count: 2 }]);

    // PII canary suite: nothing personal in any request to the gateway.
    const sent = JSON.stringify(llm.requests);
    for (const canary of Object.values(CANARY)) expect(sent).not.toContain(canary);
    expect(sent).not.toMatch(/0912\s?345\s?678/);
    expect(sent).toContain("staff_1");

    expect(llm.requests[0]?.model).toBe("claude-haiku-5-5");
    expect(llm.requests[0]?.output_config).toEqual({ effort: "low" });
    expect(llm.requests[0]?.tool_choice).toEqual({ type: "auto" });
    const audits = await prisma.assistantToolCall.findMany({ where: { salonId } });
    expect(audits.map((a) => a.status)).toEqual(expect.arrayContaining(["ok"]));
  });

  it("keeps lists, revenue and utilisation PII-free", async () => {
    const iso = (days: number) =>
      new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
    llm.script = (_body, call) =>
      call === 1
        ? {
            content: [
              toolUse("a", "bookings_list", { from: iso(-3), to: iso(3), statuses: [], limit: 50 }),
              toolUse("b", "revenue_summary", { from: iso(-3), to: iso(3) }),
              toolUse("c", "utilization", { from: iso(0), to: iso(0) }),
            ],
          }
        : { text: "Xong." };
    const res = await ask("Tổng quan lịch, doanh thu và công suất").expect(200);
    const events = parseSse(res.text);
    expect(events.some((e) => e.type === "error")).toBe(false);
    const results = llm.requests[1]?.messages.at(-1)?.content as {
      content: string;
      is_error?: boolean;
    }[];
    const [list, revenue] = results.map((r) => JSON.parse(r.content) as Record<string, unknown>);
    expect(list).toHaveProperty("items");
    expect((list as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);
    expect(revenue).toMatchObject({
      items: [
        { kind: "estimated_from_bookings", amountVnd: 600000, bookings: 3 },
        { kind: "recorded_offline_sale", amountVnd: 0 },
        { kind: "reported_by_salon", amountVnd: null, status: "not_tracked" },
      ],
    });
    const sent = JSON.stringify(llm.requests);
    for (const canary of Object.values(CANARY)) expect(sent).not.toContain(canary);
    expect(sent).not.toContain("CANA0"); // booking reference codes stay server-side too
  });

  it("continues a conversation and keeps tokens stable", async () => {
    llm.script = () => ({ text: "staff_1." });
    const first = parseSse((await ask(`${CANARY.staff}?`).expect(200)).text);
    const id = (first[0] as { conversationId: string }).conversationId;
    llm.script = (body) => {
      expect(JSON.stringify(body.messages)).toContain("staff_1");
      return { text: "staff_1 vẫn vậy." };
    };
    const second = parseSse(
      (await ask(`Còn ${CANARY.staff} thì sao?`, owner, id).expect(200)).text,
    );
    expect(second[0]).toEqual({ type: "conversation", conversationId: id });
    expect(llm.requests.at(-1)?.messages.length).toBeGreaterThan(2);
  });

  it("escalates to Sonnet on request_deeper_analysis and on a Haiku refusal", async () => {
    llm.script = (_b, call) =>
      call === 1
        ? { content: [toolUse("e", "request_deeper_analysis", {})] }
        : { text: "Phân tích." };
    await ask("Hôm nay thế nào?").expect(200);
    expect(llm.requests.map((r) => r.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(llm.requests[1]?.fallbacks).toBe("default");

    llm.requests = [];
    llm.script = (_b, call) =>
      call === 1 ? { stop_reason: "refusal", content: [] } : { text: "OK" };
    await ask("Hôm nay thế nào?").expect(200);
    expect(llm.requests.map((r) => r.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
  });

  it("refuses roles without assistant.use, other tenants and salons without the plan", async () => {
    await ask("Hi", staffMember).expect(403);
    expect([403, 404]).toContain((await ask("Hi", otherOwner)).status);
    const res = await ask("Hi", noPlanOwner, undefined, noPlanSalonId).expect(403);
    expect((res.body as { code: string }).code).toBe(SUBSCRIPTION_ERRORS.entitlementRequired);
    expect(llm.requests).toHaveLength(0);
  });

  it("does not let another member reuse a conversation id", async () => {
    llm.script = () => ({ text: "OK" });
    const id = (parseSse((await ask("Hi").expect(200)).text)[0] as { conversationId: string })
      .conversationId;
    const other = await createSalonFixture(prisma, "Assistant conv B");
    await app.get(SubscriptionsFacade).startTrial({ salonId: other.salonId });
    const bearer = await bearerFor(app, other.ownerUserId);
    const res = await ask("Hi", bearer, id, other.salonId).expect(200);
    expect(parseSse(res.text)).toEqual([
      { type: "error", code: ASSISTANT_ERRORS.conversationNotFound },
    ]);
  });

  it("stops at the hard monthly AI cap without calling the model", async () => {
    const entitlements = app.get(EntitlementService);
    await prisma.entitlementOverride.create({
      data: {
        salonId,
        key: "ai.monthly_cost_cap_vnd",
        value: 0,
        reason: "test cap",
        createdBy: "test",
      },
    });
    try {
      await entitlements.invalidate(salonId);
      const events = parseSse((await ask("Hôm nay?").expect(200)).text);
      expect(events.at(-1)).toEqual({ type: "error", code: SUBSCRIPTION_ERRORS.quotaExceeded });
      expect(llm.requests).toHaveLength(0);
    } finally {
      await prisma.entitlementOverride.deleteMany({ where: { salonId, reason: "test cap" } });
      await entitlements.invalidate(salonId);
    }
  });
  it("cannot be blocked by a customer who books under a common word or a fixed-vocabulary name", async () => {
    // Security review 08-A2: names that equal words in questions, the context line ("Reply in
    // Vietnamese") or tool output ("confirmed", "staff_1") used to trip the egress check.
    const staffId = (await prisma.staffProfile.findFirstOrThrow({ where: { salonId } })).id;
    for (const [i, name] of [
      "Lịch",
      "Vietnamese",
      "Context",
      "Confirmed",
      "staff_1",
      "Doanh",
    ].entries()) {
      await prisma.booking.create({
        data: {
          salonId,
          referenceCode: `EVIL${String(i)}`,
          status: "cancelled_by_customer",
          source: "salon_profile",
          createdByActorType: "customer",
          staffId,
          startsAt: new Date(Date.now() + (48 + i) * 3600_000),
          endsAt: new Date(Date.now() + (48.5 + i) * 3600_000),
          totalPriceMinor: 0n,
          customerName: name,
        },
      });
    }
    llm.script = (_b, call) =>
      call === 1
        ? { content: [toolUse("v", "resolve_period", { expression: "today" })] }
        : { text: "Hôm nay ổn ạ." };
    const events = parseSse(
      (await ask("Lịch hôm nay thế nào? Doanh thu tuần này có confirmed không?").expect(200)).text,
    );
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.find((e) => e.type === "masked")).toMatchObject({ changed: false });
    expect(JSON.stringify(llm.requests[0]?.messages)).toContain("Lịch hôm nay thế nào?");
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("still redacts a typed multi-word customer name", async () => {
    llm.script = () => ({ text: "OK" });
    // Multi-word customer names are always redacted; the redacted text then passes the egress check.
    const events = parseSse((await ask(`Khách ${CANARY.customer} đến chưa?`).expect(200)).text);
    expect(events.find((e) => e.type === "masked")).toMatchObject({ changed: true });
    expect(JSON.stringify(llm.requests)).not.toContain(CANARY.customer);
  });
});

describe("AI assistant without an API key (integration)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  it("reports not configured and refuses turns with 503", async () => {
    const prisma = app.get(PrismaService);
    const salon = await createSalonFixture(prisma, "Assistant unconfigured");
    await app.get(SubscriptionsFacade).startTrial({ salonId: salon.salonId });
    const bearer = await bearerFor(app, salon.ownerUserId);
    const status = await request(http(app))
      .get(`/api/v1/salons/${salon.salonId}/assistant`)
      .set("authorization", bearer)
      .expect(200);
    expect((status.body as { configured: boolean }).configured).toBe(false);
    const res = await request(http(app))
      .post(`/api/v1/salons/${salon.salonId}/assistant/turns`)
      .set("authorization", bearer)
      .send({ text: "Hi" })
      .expect(503);
    expect((res.body as { code: string }).code).toBe(ASSISTANT_ERRORS.notConfigured);
  });
});
