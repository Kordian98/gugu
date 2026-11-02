import { describe, expect, it } from "vitest";
import { BOOKING_SOURCES } from "@gugu/contracts";
import {
  AI_AGENT_SOURCES,
  CUSTOMER_SELF_SERVICE_SOURCES,
  decideInitialStatus,
  type DraftPolicyInput,
  STAFF_ENTRY_SOURCES,
} from "./draft-policy";

const base: DraftPolicyInput = {
  actorType: "customer",
  source: "salon_profile",
  identityVerified: false,
  isFirstVisit: true,
  confirmationMode: "auto",
  confirmNewClients: false,
};

describe("decideInitialStatus (X9 + X11, q13, q66)", () => {
  it("AI-agent bookings are always drafts", () => {
    expect(
      decideInitialStatus({
        ...base,
        actorType: "ai_agent",
        source: "ai_agent",
        identityVerified: true,
      }),
    ).toEqual({ kind: "draft" });
  });

  it("staff entries are confirmed, even in manual mode and unverified", () => {
    for (const source of STAFF_ENTRY_SOURCES) {
      expect(
        decideInitialStatus({
          ...base,
          actorType: "salon_member",
          source,
          confirmationMode: "manual",
          confirmNewClients: true,
        }),
      ).toEqual({ kind: "booking", status: "confirmed" });
    }
  });

  it("customer self-service needs no OTP: confirmed by default", () => {
    expect(decideInitialStatus(base)).toEqual({ kind: "booking", status: "confirmed" });
  });

  it.each<[Partial<DraftPolicyInput>, string]>([
    [{ confirmationMode: "manual", isFirstVisit: false, identityVerified: true }, "pending"],
    [{ confirmNewClients: true, isFirstVisit: true, identityVerified: true }, "pending"],
    [{ confirmNewClients: true, isFirstVisit: false, identityVerified: false }, "pending"],
    [{ confirmNewClients: true, isFirstVisit: false, identityVerified: true }, "confirmed"],
  ])("customer %o → %s", (patch, status) => {
    expect(decideInitialStatus({ ...base, ...patch })).toEqual({ kind: "booking", status });
  });

  it.each<[DraftPolicyInput["actorType"], string]>([
    ["ai_agent", "staff_created"],
    ["salon_member", "salon_profile"],
    ["customer", "walk_in"],
    ["customer", "ai_agent"],
    ["system", "salon_profile"],
  ])("rejects %s with source %s", (actorType, source) => {
    expect(decideInitialStatus({ ...base, actorType, source })).toEqual({
      kind: "invalid_actor_source",
    });
  });

  it("every BookingSource (owned by topic 12) belongs to exactly one actor class", () => {
    const classes = [STAFF_ENTRY_SOURCES, CUSTOMER_SELF_SERVICE_SOURCES, AI_AGENT_SOURCES];
    for (const source of BOOKING_SOURCES) {
      expect(classes.filter((c) => c.includes(source))).toHaveLength(1);
    }
    expect(classes.flat().sort()).toEqual([...BOOKING_SOURCES].sort());
  });
});
