import { describe, expect, it } from "vitest";
import {
  CUSTOMER_NOTIFICATION_EVENTS,
  LOCALE_VALUES_FOR_TEST,
  TEAM_NOTIFICATION_EVENTS,
} from "./test-locales";
import { resources } from "@gugu/localization";
import { CATALOG, teamDef } from "../domain/catalog";
import { renderTeamEmail, TEAM_PLACEHOLDERS } from "./email-templates";

const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1] ?? "");

/**
 * Template coverage: every event × channel × locale. Team events: bell text + email (vi, en).
 * Customer events have one channel, `zalo_template`, whose templates are the approved ZBS
 * templates owned by module `zalo` — there are no customer email templates (X26).
 */
describe("notification template coverage (every event × channel × locale)", () => {
  for (const locale of LOCALE_VALUES_FOR_TEST) {
    const email = resources[locale].notifications.email as unknown as Record<string, unknown>;
    const team = email["team"] as Record<string, Record<string, string>>;

    for (const event of TEAM_NOTIFICATION_EVENTS) {
      it(`${locale} team ${event}: email template and bell text`, () => {
        const t = team[teamDef(event).templateKey];
        for (const part of ["subject", "heading", "intro"]) {
          const s = t?.[part];
          expect(s, part).toBeTruthy();
          for (const p of placeholders(s ?? "")) expect(TEAM_PLACEHOLDERS).toContain(p);
        }
        const items = resources[locale].notifications.panel.inbox.items as Record<string, string>;
        expect(items[event.replace(/\./g, "_")]).toBeTruthy();
      });
    }

    it(`${locale}: no customer email copy exists (X26)`, () => {
      const keys = Object.keys(email);
      for (const k of [
        "bookingConfirmed",
        "bookingRescheduled",
        "bookingCancelledBySalon",
        "bookingReminder",
        "greeting",
        "contactReply",
        "calendarHint",
        "payAtSalon",
      ]) {
        expect(keys).not.toContain(k);
      }
      expect(Object.keys(resources[locale].notifications)).not.toContain("ics");
    });
  }

  it("customer events have no email channel to template", () => {
    for (const event of CUSTOMER_NOTIFICATION_EVENTS) {
      expect(CATALOG[event].channels).toEqual(["zalo_template"]);
    }
  });
});

describe("every email string uses only known variables", () => {
  const strings = (o: unknown, path = ""): [string, string][] =>
    typeof o === "string"
      ? [[path, o]]
      : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
          strings(v, path ? `${path}.${k}` : k),
        );
  const allowed = new Set<string>([...TEAM_PLACEHOLDERS, "date", "time"]);
  for (const locale of LOCALE_VALUES_FOR_TEST) {
    it(`${locale}: notifications.email.*`, () => {
      const ns = resources[locale].notifications;
      for (const [path, s] of strings(ns.email, "email")) {
        for (const p of placeholders(s)) expect(allowed.has(p), `${path}: {{${p}}}`).toBe(true);
      }
    });
  }
});

describe("team email rendering", () => {
  it("links to the panel and never includes a phone number", () => {
    for (const locale of LOCALE_VALUES_FOR_TEST) {
      const m = renderTeamEmail("salon.booking_received", locale, {
        salon: "Lotus",
        code: "AB12CD",
        when: "14:00",
        service: "Sơn gel",
        staff: "Linh",
        customer: "Lan",
        link: "http://localhost:8097/vi/business/calendar",
      });
      expect(m.subject).toContain("AB12CD");
      expect(m.html).toContain('href="http://localhost:8097/vi/business/calendar"');
      expect(m.text).not.toMatch(/\+84|09\d{8}/);
    }
  });

  it("renders vi and en for every team event, escapes HTML, rejects unknown variables", () => {
    for (const locale of LOCALE_VALUES_FOR_TEST) {
      for (const event of TEAM_NOTIFICATION_EVENTS) {
        const m = renderTeamEmail(event, locale, {
          salon: "<b>Lotus</b>",
          code: "AB12CD",
          when: "14:00",
          service: "Sơn gel",
          staff: null,
          customer: null,
          link: "http://localhost:8097/vi/business/calendar",
        });
        expect(m.subject).toBeTruthy();
        expect(m.subject).not.toMatch(/[\r\n]/);
        expect(m.html).not.toContain("<b>Lotus</b>");
      }
    }
    expect(() =>
      renderTeamEmail("salon.booking_received", "vi", {
        salon: "Lotus",
        code: null,
        when: null,
        service: null,
        staff: null,
        customer: null,
        link: "http://localhost:8097",
        phone: "0901",
      } as never),
    ).toThrow();
  });
});
