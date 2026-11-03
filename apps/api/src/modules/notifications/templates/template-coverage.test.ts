import { describe, expect, it } from "vitest";
import {
  CUSTOMER_NOTIFICATION_EVENTS,
  LOCALE_VALUES_FOR_TEST,
  TEAM_NOTIFICATION_EVENTS,
} from "./test-locales";
import { resources } from "@gugu/localization";
import { customerDef, teamDef } from "../domain/catalog";
import {
  CUSTOMER_PLACEHOLDERS,
  type CustomerEmailVars,
  renderCustomerEmail,
  renderTeamEmail,
  TEAM_PLACEHOLDERS,
} from "./email-templates";

const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1] ?? "");

const vars: CustomerEmailVars = {
  salon: "Lotus Nails & Spa",
  customerName: "Nguyễn Thị Lan",
  service: "Sơn gel · Dài",
  when: "14:00, Thứ Năm, 10 tháng 12, 2026",
  staff: "Linh",
  code: "AB12CD",
  price: "250.000đ",
  address: "12 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh",
  phone: "0901 234 567",
  canReply: true,
};

describe("notification template coverage (every event × channel × locale)", () => {
  for (const locale of LOCALE_VALUES_FOR_TEST) {
    const email = resources[locale].notifications.email as unknown as Record<
      string,
      Record<string, string>
    >;
    const team = email["team"] as unknown as Record<string, Record<string, string>>;

    for (const event of CUSTOMER_NOTIFICATION_EVENTS) {
      it(`${locale} customer ${event}: subject, preheader, heading, intro; known variables only`, () => {
        const t = email[customerDef(event).templateKey];
        expect(t).toBeDefined();
        for (const part of ["subject", "preheader", "heading", "intro"]) {
          const s = t?.[part];
          expect(s, part).toBeTruthy();
          for (const p of placeholders(s ?? "")) expect(CUSTOMER_PLACEHOLDERS).toContain(p);
        }
      });
    }
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
  }
});

describe("every email string uses only known variables", () => {
  const strings = (o: unknown, path = ""): [string, string][] =>
    typeof o === "string"
      ? [[path, o]]
      : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
          strings(v, path ? `${path}.${k}` : k),
        );
  const allowed = new Set<string>([...CUSTOMER_PLACEHOLDERS, ...TEAM_PLACEHOLDERS, "date", "time"]);
  for (const locale of LOCALE_VALUES_FOR_TEST) {
    it(`${locale}: notifications.email.* and ics.*`, () => {
      const ns = resources[locale].notifications;
      for (const [path, s] of [...strings(ns.email, "email"), ...strings(ns.ics, "ics")]) {
        for (const p of placeholders(s)) expect(allowed.has(p), `${path}: {{${p}}}`).toBe(true);
      }
    });
  }
});

describe("customer email rendering", () => {
  for (const locale of LOCALE_VALUES_FOR_TEST) {
    for (const event of CUSTOMER_NOTIFICATION_EVENTS) {
      it(`${locale} ${event} speaks as the salon, has the details and no GuGu or links`, () => {
        const m = renderCustomerEmail(event, locale, vars);
        expect(m.subject).toContain("Lotus Nails & Spa");
        expect(m.text).toContain("AB12CD");
        expect(m.text).toContain("0901 234 567");
        expect(m.text).toContain("12 Lê Lợi");
        expect(`${m.subject} ${m.text} ${m.html}`).not.toMatch(/gugu/i);
        // No link to a booking surface (owner, 2026-11-03): only tel: for the salon phone.
        expect(m.html).not.toMatch(/href="(?!tel:)/);
        expect(m.html).toContain("Lotus Nails &amp; Spa");
        expect(m.html).not.toContain("Lotus Nails & Spa");
      });
    }
  }

  it("renders vi copy for a confirmation (snapshot of the text part)", () => {
    expect(renderCustomerEmail("booking.confirmed", "vi", vars).text).toMatchInlineSnapshot(`
      "Lịch hẹn đã được xác nhận

      Chào Nguyễn Thị Lan,
      Lotus Nails & Spa xác nhận lịch hẹn của bạn. Hẹn gặp bạn nhé!

      Dịch vụ: Sơn gel · Dài
      Thời gian: 14:00, Thứ Năm, 10 tháng 12, 2026
      Nhân viên: Linh
      Mã lịch hẹn: AB12CD
      Giá dự kiến: 250.000đ
      Địa chỉ: 12 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh
      Điện thoại: 0901 234 567

      Thanh toán trực tiếp tại salon.
      Nếu cần đổi hoặc hủy lịch, bạn chỉ cần trả lời email này hoặc liên hệ Lotus Nails & Spa.
      Mở tệp đính kèm để thêm lịch hẹn vào lịch của bạn.

      --
      Bạn nhận được email này vì đã đặt lịch tại Lotus Nails & Spa."
    `);
  });

  it("renders en copy for a cancellation (no price, no calendar hint)", () => {
    const m = renderCustomerEmail("booking.cancelled_by_salon", "en", { ...vars, canReply: false });
    expect(m.subject).toBe("Your appointment at Lotus Nails & Spa was cancelled");
    expect(m.text).not.toContain("250.000đ");
    expect(m.text).not.toContain("calendar");
    expect(m.text).toContain("To change or cancel, please contact Lotus Nails & Spa.");
  });

  it("escapes HTML in salon-entered values and rejects unknown variables", () => {
    const m = renderCustomerEmail("booking.reminder", "vi", {
      ...vars,
      salon: `<script>alert(1)</script>`,
    });
    expect(m.html).not.toContain("<script>");
    expect(() =>
      renderCustomerEmail("booking.reminder", "vi", { ...vars, note: "x" } as CustomerEmailVars),
    ).toThrow();
    expect(() => renderCustomerEmail("booking.reminder", "vi", { ...vars, code: "" })).toThrow();
  });

  it("keeps subjects on one line even if a salon name contains a newline", () => {
    const m = renderCustomerEmail("booking.confirmed", "en", { ...vars, salon: "Lotus\r\nBcc: x" });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
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
});
