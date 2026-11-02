import { describe, expect, it } from "vitest";
import { renderMagicLinkEmail } from "./email-templates";

describe("magic link email", () => {
  it("renders Vietnamese by default copy with link and code", () => {
    const mail = renderMagicLinkEmail({
      template: "magicLink",
      locale: "vi",
      to: "a@b.vn",
      link: "http://localhost:8097/vi/auth/verify?token=abc",
      code: "123456",
    });
    expect(mail.subject).toBe("Link đăng nhập GuGu Studio của bạn");
    expect(mail.text).toContain("123456");
    expect(mail.html).toContain("token=abc");
  });

  it("renders English and escapes salon names", () => {
    const mail = renderMagicLinkEmail({
      template: "salonRegistration",
      locale: "en",
      to: "a@b.vn",
      link: "http://x",
      code: "000001",
      salonName: "<Lotus & Co>",
    });
    expect(mail.subject).toBe("Confirm <Lotus & Co> in GuGu Studio");
    expect(mail.html).toContain("&lt;Lotus &amp; Co&gt;");
    expect(mail.html).not.toContain("<Lotus");
  });
});
