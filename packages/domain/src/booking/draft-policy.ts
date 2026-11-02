import type { BookingStatus } from "./state-machine";

/**
 * Draft vs pending vs confirmed for a new booking (spec 06 §3.9a; X9 as amended by X11, q13, q66).
 * Decided by the actor class, never by `source` alone. Booking never requires OTP.
 */

/** Who creates the booking. */
export type BookingActorType = "customer" | "salon_member" | "ai_agent" | "system";

/** Sources a salon member enters in the CRM (the entry itself is the confirmation). */
export const STAFF_ENTRY_SOURCES: readonly string[] = [
  "staff_created",
  "walk_in",
  "phone",
  "zalo_chat",
];

/** Sources of customer self-service (own booking page, links, QR, Zalo button, later marketplace). */
export const CUSTOMER_SELF_SERVICE_SOURCES: readonly string[] = [
  "marketplace",
  "salon_profile",
  "direct_link",
  "qr_code",
  "social_media",
  "repeat_customer",
  "zalo_link",
  "zalo_oa",
  "zalo_mini_app",
  "promoted_listing",
  "gugu_campaign",
];

export const AI_AGENT_SOURCES: readonly string[] = ["ai_agent"];

export interface DraftPolicyInput {
  actorType: BookingActorType;
  source: string;
  /** Phone proven by email link / Zalo / signed-in account. False does not block (X11). */
  identityVerified: boolean;
  /** No completed booking for this phone at this salon yet. */
  isFirstVisit: boolean;
  confirmationMode: "auto" | "manual";
  /** q66: salon wants to confirm first-time or unverified customers. */
  confirmNewClients: boolean;
}

export type DraftDecision =
  | { kind: "draft" }
  | { kind: "booking"; status: Extract<BookingStatus, "pending" | "confirmed"> }
  | { kind: "invalid_actor_source" };

export function decideInitialStatus(input: DraftPolicyInput): DraftDecision {
  const { actorType, source } = input;
  if (actorType === "ai_agent") {
    return AI_AGENT_SOURCES.includes(source) ? { kind: "draft" } : { kind: "invalid_actor_source" };
  }
  if (actorType === "salon_member") {
    return STAFF_ENTRY_SOURCES.includes(source)
      ? { kind: "booking", status: "confirmed" }
      : { kind: "invalid_actor_source" };
  }
  if (actorType === "customer") {
    if (!CUSTOMER_SELF_SERVICE_SOURCES.includes(source)) return { kind: "invalid_actor_source" };
    const needsSalon =
      input.confirmationMode === "manual" ||
      (input.confirmNewClients && (input.isFirstVisit || !input.identityVerified));
    return { kind: "booking", status: needsSalon ? "pending" : "confirmed" };
  }
  return { kind: "invalid_actor_source" };
}
